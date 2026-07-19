import "server-only";
import { db, resilientQuery } from "@/lib/db";
import { accounts, transactions, statements, userCategories, merchants, fileUploadLog, users, merchantWarningRules, merchantLabelRules } from "@/lib/db/schema";
import { ensureUserCategories } from "@/lib/ensure-user-categories";
import { ensureTransactionWarningFlagColumn } from "@/lib/ensure-transaction-warning-flag";
import { excludeCardPaymentsSql, excludeIgnoredSql } from "@/lib/db/excluded-transactions";
import { ai, GEMINI_MODEL } from "@/lib/gemini";
import { logAiCost } from "@/lib/ai-cost";
import { logServerError } from "@/lib/safe-error";
import { aiResponseSchema } from "@/lib/validations/ingest";
import { ef, df } from "@/lib/crypto/encryption";
import { eq, and, asc, desc, sql, inArray, isNull } from "drizzle-orm";
import { assignOccurrenceIndices, buildDedupeSignature, isStrongReferenceId, normalizeBaseAmount } from "@/lib/txn-dedupe";

/**
 * Queries the categories table and the user's transactions to build:
 *  - historyJson: compact category → subcategory → merchants hierarchy
 *  - subcategoryNames: the allowed subcategory names for category_suggestion
 *
 * For first-time users the hierarchy still contains every system
 * category/subcategory (with empty merchant arrays).
 */
async function buildUserContext(userId: string) {
  await ensureUserCategories(userId);

  const [allCats, userMerchantRows] = await Promise.all([
    resilientQuery(() =>
      db
        .select({ id: userCategories.id, name: userCategories.name, slug: userCategories.slug, parentId: userCategories.parentId })
        .from(userCategories)
        .where(eq(userCategories.userId, userId))
        .orderBy(userCategories.sortOrder),
    ),
    resilientQuery(() =>
      db
        .select({
          categoryName: userCategories.name,
          merchantName: transactions.merchantName,
        })
        .from(transactions)
        .innerJoin(
          userCategories,
          and(
            eq(transactions.categoryId, userCategories.id),
            eq(userCategories.userId, userId),
          ),
        )
        .where(
          and(
            eq(transactions.userId, userId),
            excludeCardPaymentsSql(), excludeIgnoredSql(),
            sql`${transactions.merchantName} IS NOT NULL`,
            sql`TRIM(${transactions.merchantName}) != ''`,
          ),
        )
        .groupBy(userCategories.name, transactions.merchantName),
    ),
  ]);

  const parentById = new Map<number, { name: string; parentId: number | null }>();
  for (const c of allCats) parentById.set(c.id, { name: c.name, parentId: c.parentId });

  const tree: Record<string, Record<string, Set<string>>> = {};
  const subcategoryNames: string[] = [];
  const travelSubcategoryNames = new Set<string>();

  for (const c of allCats) {
    if (c.parentId == null) {
      tree[c.name.trim().toLowerCase()] ??= {};
    } else {
      const parent = parentById.get(c.parentId);
      if (parent) {
        const parentName = parent.name.trim().toLowerCase();
        const childName = c.name.trim().toLowerCase();
        tree[parentName] ??= {};
        tree[parentName][childName] ??= new Set();
        // Use slugs for LLM output to avoid ambiguous duplicate names like "Other".
        subcategoryNames.push(c.slug.trim());
        if (parentName === "travel") {
          travelSubcategoryNames.add(c.slug.trim());
        }
      }
    }
  }

  for (const row of userMerchantRows) {
    const merchant = (row.merchantName ?? "").trim().toLowerCase();
    if (!merchant) continue;
    const leafName = (row.categoryName ?? "").trim().toLowerCase();
    const leafCat = allCats.find((c) => c.name.trim().toLowerCase() === leafName);
    if (leafCat?.parentId != null) {
      const parent = parentById.get(leafCat.parentId);
      if (parent) {
        const parentName = parent.name.trim().toLowerCase();
        tree[parentName] ??= {};
        tree[parentName][leafName] ??= new Set();
        tree[parentName][leafName].add(merchant);
      }
    } else {
      tree[leafName] ??= {};
      (tree[leafName]["general"] ??= new Set()).add(merchant);
    }
  }

  const result: Record<string, Record<string, string[]>> = {};
  for (const cat of Object.keys(tree).sort()) {
    result[cat] = {};
    for (const sub of Object.keys(tree[cat]).sort()) {
      result[cat][sub] = [...tree[cat][sub]].sort();
    }
  }

  return {
    historyJson: JSON.stringify(result),
    subcategoryNames,
    travelSubcategoryNames: [...travelSubcategoryNames].sort(),
  };
}

const MERCHANT_HISTORY_INSTRUCTIONS = `
MERCHANT & CATEGORY HISTORY (CRITICAL — read carefully):
Below is a JSON object representing this user's existing category → subcategory → merchant assignments from previously processed statements. You MUST follow these rules strictly:

1. REUSE EXISTING MERCHANT NAMES: If a transaction's merchant matches or is clearly the same entity as a merchant already listed in the history, you MUST use the EXACT same lowercase merchant_name string from the history. Do NOT create a new variant, abbreviation, or spelling. For example, if the history contains "starbucks coffee" and you see "STARBUCKS COFFEE SG", output "starbucks coffee" — not a new string.

2. REUSE EXISTING CATEGORIES: If a merchant already appears under a specific subcategory in the history, assign category_suggestion to that SAME subcategory for new transactions from that merchant. Do NOT reassign known merchants to different categories.

3. NEW MERCHANTS: Only create a new merchant_name (still all lowercase) when no existing merchant in the history is a reasonable match. Even then, prefer assigning it to an existing subcategory from the history that best fits.

5. DESCRIPTION-BASED CLASSIFICATION: When a known merchant's transaction description contains clear category signals (e.g. "rental", "groceries", "fuel", "salary"), those signals may override the merchant's historical category IF the description clearly indicates a different type of spend. Always read the full raw_description for context clues.

4. EMPTY MERCHANT ARRAYS: Some subcategories have empty arrays — those are valid categories the user has but no merchants yet. You may assign new merchants to them.

User's merchant history:
`;

function buildSystemInstruction(
  subcategoryList: string,
  travelSubcategoryList: string,
  userMainCurrency: string | null,
  detectTravel: "Yes" | "No",
): string {
  const mc = userMainCurrency?.toUpperCase() ?? "UNKNOWN";
  const dt = detectTravel;
  return `You are FinTRK, a financial statement (credit card, debit card, checking account) data extraction engine. You receive bank statement data (as a markdown table or as a PDF/image) and extract every transaction into a strictly structured JSON array.

For EACH transaction, you MUST:

1. DATES (CRITICAL - exactly ONE transaction per statement line, worldwide):
   - Statements from any country or bank may print MORE THAN ONE date per transaction. There are two conceptual date types:
       (a) the TRANSACTION date = when the purchase/payment/withdrawal actually occurred (the economic event);
       (b) the POSTING date = when the bank recorded/cleared/settled it on the account.
     When two or more dates appear on one line, they almost always describe the SAME single transaction, NOT separate transactions.
   - Column labels vary by bank, region, and language. Do NOT rely on any specific wording. Recognize the date type from meaning, position, and locale, not from an exact label. Non-exhaustive examples of the same two concepts across labels/languages:
       * Transaction date: "Transaction Date", "Trans Date", "Trans. Date", "Txn Date", "Purchase Date", "Sale Date", "Value Date", "Date of Transaction", "Date d'operation", "Fecha de operacion", "Buchungsdatum vs Belegdatum (Belegdatum = transaction)", "Data operazione", "Data transacao", "Datum transakce", "取引日", "交易日", "거래일".
       * Posting date: "Posting Date", "Post Date", "Posted", "Booking Date", "Settlement Date", "Date de comptabilisation", "Fecha de contabilizacion", "Buchungsdatum", "Data contabile", "Data lancamento", "記帳日", "入账日", "처리일".
     Also handle single-date statements, date ranges, and dates embedded inside the description text.
   - You MUST emit EXACTLY ONE transaction object per statement line. NEVER output two transactions because a line shows two (or more) dates, wraps across multiple visual lines, or repeats a reference number.
   - Set posted_date (YYYY-MM-DD) to the TRANSACTION date (concept (a) above) whenever any transaction/purchase/value date is present. ONLY when no transaction date exists at all should you fall back to the posting/booking/settlement date. If exactly one date is present, use it. Be consistent: apply the same choice to every row of the statement.
   - Always normalize to YYYY-MM-DD regardless of the source format (e.g. DD/MM/YYYY, MM/DD/YYYY, DD-MMM-YY, YYYY年MM月DD日). Infer day/month order from the statement's country, currency, and surrounding dates; never swap day and month.

2. DESCRIPTIONS:
   - raw_description: exact text from the statement, unmodified
   - reference_id: ONLY a bank-issued unique transaction identifier from the statement line — NOT the merchant name, NOT a cleaned description, NOT the payee/counterparty label.
     * Search the raw line for labels such as: "Ref No", "Reference", "Ref:", "Txn ID", "Transaction ID", "Trace", "Trace No", "Auth Code", "Approval", "ARN", "End To End", "UETR", "FIT ID", "Cheque No", "Narrative ref", or locale-specific equivalents.
     * Extract ONLY the code value (strip labels and punctuation). Examples: "Ref No: 74556226089108636068214" → reference_id "74556226089108636068214" | "Auth 123456" → "123456" | "E2E1234567890123456789012" → that full string.
     * The value MUST contain at least one digit OR be a compact alphanumeric code (6–40 chars) clearly separate from merchant text. Long numeric strings (10–35+ digits) are common for bank references.
     * If the line has NO such code — only merchant or free text — set reference_id to null. Never copy merchant_name into reference_id. Never use title-case merchant text as reference_id.
   - merchant_name: the canonical merchant name in **all lowercase** (e.g., "AMZN*2847362" → "amazon", "UBER *EATS" → "uber eats", "DD *DOORDASH" → "doordash", "GRAB FOOD" → "grab food")

3. AMOUNTS:
   - base_amount: transaction amount in the account's primary currency. NEGATIVE for debits/expenses, POSITIVE for credits/income.
   - base_currency: ISO 4217 code of the account's primary currency
   - If a foreign currency amount is present:
     - foreign_amount: the amount in foreign currency (always positive)
     - foreign_currency: ISO 4217 code
     - implicit_fx_rate: the implied exchange rate (base_amount / foreign_amount)

4. CLASSIFICATION:
   - country_iso: ISO 3166-1 alpha-2 country code, inferred from explicit country indicators, currency, or merchant name recognition. Default to the account's country if ambiguous.
   - category_suggestion: your best category from this exact list of SUBCATEGORY SLUGS: ${subcategoryList}
     MANDATORY — SUBCATEGORY SLUG ONLY: The list above contains SUBCATEGORY SLUGS (children). You MUST ALWAYS output one of those exact slug values — NEVER a parent category name and NEVER a free-form label. Parent categories (e.g. "Food & Dining", "Transportation", "Shopping", "Other Misc") are groupings only and must NOT appear as category_suggestion values. Always drill down to the most specific subcategory that fits.
     IMPORTANT: To determine the correct subcategory, you MUST analyze the ENTIRE raw_description — not only the merchant name. Transaction descriptions often contain keywords like "rental", "groceries", "salary", "insurance", "transfer", "loan", "utilities", "dining", "fuel", etc. that are strong category signals. Always use every available clue from the full description text, any embedded notes, and the merchant name together to pick the most accurate subcategory.

SPECIAL CATEGORY RULES (apply BEFORE general classification):

  FX TRAVEL OVERRIDE (MANDATORY):
     DETECT_TRAVEL for this request: ${dt}.
     USER_MAIN_CURRENCY for this request: ${mc}.
     ONLY WHEN DETECT_TRAVEL == "Yes": If (a) a transaction has foreign_currency AND foreign_currency != "USD" OR (b) base_currency != USER_MAIN_CURRENCY, you MUST map it to the parent Category "Travel" and set category_suggestion to the BEST-FITTING Travel SUBCATEGORY SLUG from this list: ${travelSubcategoryList || "travel"}.
     WHEN DETECT_TRAVEL == "No": do NOT apply this FX Travel override rule.

     CRITICAL — PICK THE RIGHT TRAVEL SUBCATEGORY (do NOT default everything to "Flights"):
     Use the merchant name, raw_description, and spending context to choose the most appropriate Travel subcategory:
       • Flights / Airlines / Air tickets → "Flights"
       • Hotels / Hostels / Airbnb / Lodging → "Accommodation"
       • Restaurants / Fast food / Cafés / Groceries / Supermarkets / Food & drink → "Meals"
       • Tours / Sightseeing / Theme parks / Museums / Attractions → "Activities"
       • Travel insurance → "Travel Insurance"
       • Car rental / Vehicle hire → "Car Rental"
       • Fuel / Gas stations / Parking / Tolls / Taxis / Ride-share / Public transit / Trains → "Other" (travel transport)
       • All other foreign-currency spending (retail shopping, personal care, pharmacies, etc.) → "Other"
     "Flights" is ONLY for actual airline/flight bookings. Never use it as a catch-all.

   A) CARD PAYMENTS — category "Other Misc" → subcategory slug "card-payments":
      On CREDIT CARD statements: look for POSITIVE (credit) transactions that are payments made TO the credit card to reduce the outstanding balance. These typically appear as "PAYMENT RECEIVED", "PAYMENT THANK YOU", "AUTOPAY", "PAYMENT - THANK YOU", "ONLINE PAYMENT", "MOBILE PAYMENT", "PAYMENT FROM CHECKING", "BILL PAYMENT", "CR ADJUSTMENT", or similar bank-generated descriptions — NOT merchant purchases. If you are confident the transaction is a payment toward the credit card balance, assign category_suggestion = "card-payments" (if this slug exists in the allowed list).
      On CHECKING / DEBIT CARD statements: look for NEGATIVE (debit) transactions that are payments made FROM the checking account TO a credit card. These typically appear as "CREDIT CARD PAYMENT", "CC PAYMENT", "CARD PAYMENT", "PAYMENT TO VISA", "PAYMENT TO MASTERCARD", "PAYMENT TO AMEX", "PAY CREDIT CARD", or the bank's own credit card product name. If you are confident the transaction is a payment toward a credit card, assign category_suggestion = "card-payments" (if present in allowed list).
      Do NOT tag regular merchant purchases as Card Payments — only balance payments / transfers between the user's own accounts.

   B) ATM WITHDRAWALS — category "Other Misc" → subcategory slug "atm-withdrawal-outflow":
      Carefully scan every transaction for ATM cash withdrawal patterns. These appear under many descriptions across banks and countries: "ATM WITHDRAWAL", "ATM WDL", "ATM W/D", "CASH WITHDRAWAL", "CASH WDL", "ATM CASH", "SELF-SERVICE WITHDRAWAL", "INSTANT CASH", "CARDLESS WITHDRAWAL", "ATM-", "S/A ATM", "NWD" (non-branch withdrawal), "CASH ADVANCE" (at an ATM, not a merchant), or descriptions containing the word "ATM" together with an amount or location. Also watch for locale-specific variants: "RETRAIT DAB", "CAJERO", "GELDAUTOMAT", "PRELIEVO ATM/BANCOMAT", "SAQUE", etc. If the transaction is clearly a cash withdrawal from an ATM (negative on checking/savings, or cash advance on credit), assign category_suggestion = "atm-withdrawal-outflow" (if this slug exists in the allowed list). Do NOT confuse ATM withdrawals with point-of-sale cashback or merchant purchases that happen to mention a location near an ATM.

   C) BANK FEES & INTEREST — category "Other Misc" → subcategory "Bank Fees":
      Identify all bank-imposed fees and interest charges across any account type. These are negative transactions (charges to the customer) that are NOT merchant purchases. Common patterns include:
      - Annual / monthly fees: "ANNUAL FEE", "MONTHLY FEE", "MEMBERSHIP FEE", "CARD FEE", "ACCOUNT FEE", "MAINTENANCE FEE", "SERVICE CHARGE", "ACCOUNT SERVICE FEE"
      - Interest charges: "INTEREST CHARGED", "INTEREST CHARGE", "FINANCE CHARGE", "PURCHASE INTEREST", "CASH ADVANCE INTEREST", "INTEREST ON BALANCE", "INT CHG", "MONTHLY INTEREST"
      - Late / penalty fees: "LATE FEE", "LATE PAYMENT FEE", "OVERLIMIT FEE", "OVER LIMIT FEE", "RETURNED PAYMENT FEE", "NSF FEE", "INSUFFICIENT FUNDS FEE", "PENALTY FEE"
      - Transaction fees: "FOREIGN TRANSACTION FEE", "FX FEE", "CROSS-BORDER FEE", "CASH ADVANCE FEE", "BALANCE TRANSFER FEE", "CONVENIENCE FEE", "PROCESSING FEE"
      - Other bank charges: "STMT FEE", "PAPER STATEMENT FEE", "REPLACEMENT CARD FEE", "EXPEDITED CARD FEE", "WIRE FEE", "TRANSFER FEE", "DORMANCY FEE", "INACTIVITY FEE", "MIN BALANCE FEE"
      If the transaction is clearly a fee or interest charge imposed by the bank or card issuer, assign category_suggestion = "bank-fees". Do NOT confuse bank fees with third-party service charges from merchants (e.g. a convenience fee charged by a utility company is a utility payment, not a bank fee).

5. PATTERNS:
   - is_recurring: true if this merchant appears to charge on a regular schedule (subscriptions, rent, salary, insurance, loan payments)
   - confidence: 0.0 to 1.0 — your confidence in the overall extraction quality

6. ACCOUNT / CARD IDENTIFICATION (account_metadata):
   - account_type: determine PRECISELY from the document:
     * "credit" — credit card statements (look for "Credit Card", "Card Statement", credit limit, minimum payment due, statement balance)
     * "checking" — debit card statements, current account / chequing account statements, transaction account statements
     * "savings" — savings account statements
     * "investment" — brokerage / investment account statements
     * "unknown" — only if truly ambiguous
   - card_network: identify the card network from the statement header, logo, card name, or BIN range. Must be one of: "visa", "mastercard", "amex", "discover", "jcb", "unionpay", "diners", or null if it is a plain bank account (not a card) or the network cannot be determined. Look for:
     * Explicit text: "Visa", "Visa Classic", "Visa Platinum", "MasterCard", "Mastercard World", "American Express", "AMEX", "Discover", "JCB", "UnionPay", "Diners Club"
     * Card logos or branding in PDF headers
     * BIN/IIN prefixes if a partial card number is visible (4xxx = Visa, 5xxx/2xxx = Mastercard, 3xxx = AMEX/JCB/Diners)
   - masked_last_four: extract the last 4 digits of the card or account number. Look for patterns like "XXXX XXXX XXXX 1234", "****1234", "Card ending 5678", account numbers with last 4 visible. Return ONLY the last 4 digits as a string (e.g. "1234"). If not found, null. NEVER output a full card number.
   - If the source filename suggests product type (e.g. names containing "CC_" or "CARD" often indicate a credit card export; "ACC_" or "ACCOUNT" often indicate a bank / checking account export), use that as a strong signal together with the document body for account_type — do not classify a checking account CSV as a credit card just because the bank name matches.

RESPONSE FORMAT: Return ONLY valid JSON with this exact shape:
{
  "account_metadata": {
    "institution_name": string | null,
    "account_type": "checking" | "savings" | "credit" | "investment" | "unknown",
    "card_network": "visa" | "mastercard" | "amex" | "discover" | "jcb" | "unionpay" | "diners" | null,
    "primary_currency": string,
    "country_iso": string | null,
    "statement_period_start": string | null,
    "statement_period_end": string | null,
    "masked_last_four": string | null
  },
  "transactions": [...]
}`;
}

function dataToMarkdownTable(headers: string[], rows: Record<string, unknown>[]): string {
  const sep = "| " + headers.map(() => "---").join(" | ") + " |";
  const header = "| " + headers.join(" | ") + " |";
  const pipe = /\|/g;
  const body = rows
    .map((row) => {
      const cells = headers.map((h) => String(row[h] ?? "").replace(pipe, "\\|"));
      return "| " + cells.join(" | ") + " |";
    })
    .join("\n");
  return [header, sep, body].join("\n");
}

function canonicalizeMerchant(name: string): string {
  return name
    .replace(/[*#]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\b(PAYPAL|SQ |DD |AMZN|CKO)\s?\*/i, "")
    .trim()
    .toLowerCase();
}

/** Reject AI mistakes: merchant name, raw description, or narrative copied as "reference". */
function sanitizeAiReferenceId(
  ref: string | null | undefined,
  merchantName: string | null | undefined,
  rawDescription?: string | null,
): string | undefined {
  const t = ref?.trim();
  if (!t) return undefined;

  const collapsed = t.replace(/\s+/g, " ");
  if (collapsed.length > 128) return collapsed.slice(0, 128).trim() || undefined;

  // Must contain at least one digit — real bank references always do.
  if (!/\d/.test(collapsed)) return undefined;

  // Reject PAN / account-number shaped values (15–19 all-digit) — reused across lines.
  const compact = collapsed.replace(/[\s-]/g, "");
  const digitsOnly = compact.replace(/\D/g, "");
  if (
    digitsOnly.length >= 15 &&
    digitsOnly.length <= 19 &&
    digitsOnly.length === compact.length
  ) {
    return undefined;
  }
  // Reject masked account tails like xxxxxx3050
  if (/x{2,}/i.test(collapsed)) return undefined;
  // Short codes (< 12) are usually auth codes / shared bank codes, not unique txn ids.
  // Keep them out of reference_id storage; line signature + occurrence handles dedupe.
  if (collapsed.length < 12) return undefined;

  const strip = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const refStripped = strip(collapsed);
  if (refStripped.length < 3) return undefined;

  // Block if it matches merchant_name
  const m = merchantName?.trim();
  if (m) {
    if (collapsed.toLowerCase() === m.toLowerCase()) return undefined;
    const ms = strip(m);
    if (ms.length >= 3 && refStripped === ms) return undefined;
    // Block "merchant + number suffix" patterns like "AMAZON RETAIL SG" being kept
    // because of digits in the merchant code — check if ref is a substring of merchant or vice-versa
    if (ms.length >= 4 && refStripped.length >= 4) {
      if (refStripped.includes(ms) || ms.includes(refStripped)) return undefined;
    }
  }

  // Block if it matches raw_description (the AI sometimes echoes back the raw line)
  const rd = rawDescription?.trim();
  if (rd) {
    if (collapsed.toLowerCase() === rd.toLowerCase()) return undefined;
    const rds = strip(rd);
    if (rds.length >= 4 && refStripped === rds) return undefined;
  }

  return collapsed;
}

function normInstitution(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function lastFourFromStoredMasked(masked: string | null | undefined): string | undefined {
  if (!masked) return undefined;
  const digits = masked.replace(/\D/g, "");
  if (digits.length < 2) return undefined;
  return digits.slice(-4);
}

type AccountPickRow = {
  id: string;
  maskedNumber: string | null;
  cardNetwork: string | null;
  accountType: string;
  institutionName: string | null;
};

/**
 * Multi-tier account matching. Each tier is strictly gated - we never
 * fall through to a looser match if a tighter one was possible.
 *
 * Tier 1: exact type + exact last-four digits (narrow by exact mask / institution / network when ambiguous)
 * Tier 2: exact type + same institution (only when statement has NO last-four)
 * Tier 3: exact type, single candidate (only when statement has NO last-four)
 *
 * Returns undefined → caller MUST create a new account.
 */
function pickAccountForStatement(
  rows: AccountPickRow[],
  meta: {
    account_type: string;
    institution_name?: string | null | undefined;
    card_network?: string | null | undefined;
  },
  statementLastFour: string | undefined,
): AccountPickRow | undefined {
  const sameType = (a: AccountPickRow) => a.accountType === meta.account_type;

  // Tier 1: type + last-four match
  if (statementLastFour) {
    const byDigits = rows.filter(
      (a) => sameType(a) && lastFourFromStoredMasked(a.maskedNumber) === statementLastFour,
    );
    if (byDigits.length === 0) {
      // Last-four present but no match - distinct account; do not fall through.
      return undefined;
    }
    if (byDigits.length === 1) return byDigits[0];

    // Multiple cards can share last-four with different stored mask strings.
    // Never pick an arbitrary sibling - narrow, else create/recheck by exact mask.
    const exactMask = `••••${statementLastFour}`;
    let candidates = byDigits.filter((a) => a.maskedNumber === exactMask);
    if (candidates.length === 0) candidates = byDigits;
    if (candidates.length === 1) return candidates[0];

    const inst = normInstitution(meta.institution_name);
    if (inst) {
      const byInst = candidates.filter((a) => normInstitution(a.institutionName) === inst);
      if (byInst.length === 1) return byInst[0];
      if (byInst.length > 1) candidates = byInst;
    }

    const network = (meta.card_network ?? "").trim().toLowerCase();
    if (network) {
      const byNet = candidates.filter(
        (a) => (a.cardNetwork ?? "").trim().toLowerCase() === network,
      );
      if (byNet.length === 1) return byNet[0];
    }

    return undefined;
  }

  // Below: statement has NO last-four digits

  // Tier 2: type + institution, among accounts that also have no mask
  const inst = normInstitution(meta.institution_name);
  if (inst) {
    const byInstNoMask = rows.filter(
      (a) =>
        sameType(a) &&
        normInstitution(a.institutionName) === inst &&
        !lastFourFromStoredMasked(a.maskedNumber),
    );
    if (byInstNoMask.length === 1) return byInstNoMask[0];
  }

  // Tier 3: sole account of this type (no mask on statement → match unmasked)
  const typedNoMask = rows.filter((a) => sameType(a) && !lastFourFromStoredMasked(a.maskedNumber));
  if (typedNoMask.length === 1) return typedNoMask[0];

  return undefined;
}

/** Insert a masked account; on unique race, resolve the winning row by mask. */
async function insertAccountWithMaskRaceRetry(args: {
  userId: string;
  statementId: number;
  meta: {
    account_type: string;
    primary_currency: string;
    country_iso?: string | null;
    institution_name?: string | null;
  };
  cardNetworkFromAi: string | undefined;
  maskedFromAi: string;
}): Promise<string> {
  const { userId, statementId, meta, cardNetworkFromAi, maskedFromAi } = args;
  const type = meta.account_type as
    | "checking"
    | "savings"
    | "credit"
    | "investment"
    | "loan"
    | "unknown";
  try {
    const [newAccount] = await resilientQuery(() =>
      db
        .insert(accounts)
        .values({
          userId,
          accountName:
            ef(meta.institution_name ?? `${meta.primary_currency} Account`) ??
            `${meta.primary_currency} Account`,
          accountType: type,
          cardNetwork: cardNetworkFromAi,
          primaryCurrency: meta.primary_currency,
          countryIso: meta.country_iso ?? undefined,
          institutionName: ef(meta.institution_name ?? null) ?? undefined,
          maskedNumber: maskedFromAi,
        })
        .returning({ id: accounts.id }),
    );
    return newAccount.id;
  } catch (insertErr: unknown) {
    const isDuplicate = insertErr instanceof Error && insertErr.message.includes("unique");
    if (!isDuplicate) throw insertErr;
    const [existing] = await resilientQuery(() =>
      db
        .select({ id: accounts.id, isActive: accounts.isActive })
        .from(accounts)
        .where(
          and(
            eq(accounts.userId, userId),
            eq(accounts.primaryCurrency, meta.primary_currency),
            eq(accounts.accountType, type),
            eq(accounts.maskedNumber, maskedFromAi),
          ),
        )
        .limit(1),
    );
    if (!existing?.id) {
      logServerError(
        `process-statement/${statementId}`,
        new Error("Duplicate account insert but no matching row found after retry"),
      );
      throw new Error("Account creation race: could not resolve account row");
    }
    // Legacy soft-deletes may still hold the mask; reclaim for this statement.
    if (!existing.isActive) {
      await resilientQuery(() =>
        db
          .update(accounts)
          .set({ isActive: true, updatedAt: new Date() })
          .where(and(eq(accounts.id, existing.id), eq(accounts.userId, userId))),
      );
    }
    return existing.id;
  }
}

/**
 * Synonym thesaurus — groups of related spending-concept words.
 * NOT tied to any category name or slug; purely a word-similarity aid.
 * When a travel subcategory name contains a word from a group, all words
 * in that group become associated with that subcategory.
 */
const SYNONYM_GROUPS: string[][] = [
  ["meal", "food", "restaurant", "grocery", "dining", "cafe", "bar", "nightlife", "delivery", "supermarket", "drink", "coffee", "deli", "bakery", "eat", "bistro", "cuisine"],
  ["flight", "airline", "air", "plane", "aviation", "airport", "boarding"],
  ["accommodation", "hotel", "hostel", "lodging", "stay", "airbnb", "motel", "resort", "inn"],
  ["car", "vehicle", "automobile", "rental", "hire", "lease"],
  ["activity", "tour", "museum", "attraction", "sightseeing", "entertainment", "event", "concert", "hobby", "sport", "fitness", "recreation", "show", "theater", "cinema"],
  ["insurance", "coverage", "policy", "protection"],
  ["transport", "fuel", "gas", "petrol", "parking", "taxi", "uber", "ride", "transit", "train", "bus", "fare", "toll"],
  ["shop", "apparel", "clothing", "retail", "purchase", "store", "mall", "boutique", "technology", "electronics"],
];

const synonymIndex = new Map<string, Set<string>>();
for (const group of SYNONYM_GROUPS) {
  const s = new Set(group);
  for (const w of group) synonymIndex.set(w, s);
}

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

function stem(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (word.endsWith("ses") || word.endsWith("zes")) return word.slice(0, -2);
  if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
  return word;
}

function expandTokens(tokens: string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of tokens) {
    out.add(raw);
    const stemmed = stem(raw);
    out.add(stemmed);
    for (const form of [raw, stemmed]) {
      const group = synonymIndex.get(form);
      if (group) for (const w of group) out.add(w);
    }
  }
  return out;
}

/**
 * Returns a function that maps an original non-travel category suggestion
 * to the best-fitting Travel subcategory by word/synonym overlap.
 * Adapts automatically to whatever subcategories exist under Travel.
 */
function buildTravelMatcher(
  travelChildren: { name: string; slug: string }[],
  fallbackSlug: string | null,
): (originalSuggestion: string) => string {
  const scored = travelChildren
    .filter((c) => !/\bother\b/i.test(c.name))
    .map((c) => ({
      slug: c.slug,
      keywords: expandTokens([...tokenize(c.name), ...tokenize(c.slug)]),
    }));

  return (originalSuggestion: string): string => {
    const inputTokens = expandTokens(tokenize(originalSuggestion));
    let best: string | null = null;
    let bestScore = 0;
    for (const sub of scored) {
      let score = 0;
      for (const w of inputTokens) {
        if (sub.keywords.has(w)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        best = sub.slug;
      }
    }
    return best ?? fallbackSlug ?? "other";
  };
}

function normalizedIso(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

function isTravelOverrideMatch(
  txn: { foreign_currency?: string | null; base_currency: string },
  detectTravel: "Yes" | "No",
  userMainCurrency: string | null,
): boolean {
  if (detectTravel !== "Yes") return false;
  const foreign = normalizedIso(txn.foreign_currency);
  const base = normalizedIso(txn.base_currency);
  const main = normalizedIso(userMainCurrency);
  const hasNonUsdForeign = foreign !== "" && foreign !== "USD";
  const baseDiffersFromMain = main !== "" && base !== "" && base !== main;
  return hasNonUsdForeign || baseDiffersFromMain;
}

async function markUploadLogFailed(userId: string, fileName: string, fileSize: number, fileHash: string | null) {
  const hashClause =
    fileHash == null || fileHash === ""
      ? isNull(fileUploadLog.fileHash)
      : eq(fileUploadLog.fileHash, fileHash);
  await db
    .update(fileUploadLog)
    .set({ outcome: "failed" })
    .where(
      and(
        eq(fileUploadLog.userId, userId),
        eq(fileUploadLog.fileName, fileName),
        eq(fileUploadLog.fileSize, fileSize),
        hashClause,
      ),
    )
    .catch(() => {});
}

/** Normalize empty strings so Zod `.length(3)` fields don't fail on `""` (treated as present, not null). */
function sanitizeAiJsonForValidation(input: unknown): unknown {
  if (input === null || typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map(sanitizeAiJsonForValidation);

  const o = input as Record<string, unknown>;
  const out: Record<string, unknown> = { ...o };

  const blankToNull = (v: unknown) => (v === "" ? null : v);

  if (out.transactions && Array.isArray(out.transactions)) {
    out.transactions = out.transactions.map((txn) => {
      if (txn === null || typeof txn !== "object") return txn;
      const t = { ...(txn as Record<string, unknown>) };
      t.foreign_currency = blankToNull(t.foreign_currency);
      t.country_iso = blankToNull(t.country_iso);
      t.reference_id = t.reference_id === "" ? null : t.reference_id;
      return t;
    });
  }

  if (out.account_metadata && typeof out.account_metadata === "object" && out.account_metadata !== null) {
    const m = { ...(out.account_metadata as Record<string, unknown>) };
    m.country_iso = blankToNull(m.country_iso);
    out.account_metadata = m;
  }

  return out;
}

async function updateUserMainCurrency(userId: string) {
  const [topCurrencies, totals] = await Promise.all([
    resilientQuery(() =>
      db
        .select({
          baseCurrency: transactions.baseCurrency,
          txCount: sql<number>`count(distinct ${transactions.id})::int`,
        })
        .from(transactions)
        .where(and(eq(transactions.userId, userId), excludeCardPaymentsSql(), excludeIgnoredSql()))
        .groupBy(transactions.baseCurrency)
        .orderBy(
          desc(sql`count(distinct ${transactions.id})`),
          asc(transactions.baseCurrency),
        )
        .limit(1),
    ),
    resilientQuery(() =>
      db
        .select({
          txCount: sql<number>`count(distinct ${transactions.id})::int`,
        })
        .from(transactions)
        .where(and(eq(transactions.userId, userId), excludeCardPaymentsSql(), excludeIgnoredSql())),
    ),
  ]);

  const topCurrency = topCurrencies[0];
  const mainCurrency = topCurrency?.baseCurrency ?? null;
  const mainCurrencyTransactions = topCurrency?.txCount ?? 0;
  const totalTransactions = totals[0]?.txCount ?? 0;
  const mainCurrencyPercentage =
    totalTransactions > 0
      ? (mainCurrencyTransactions / totalTransactions).toFixed(2)
      : "0.00";

  await resilientQuery(() =>
    db
      .insert(users)
      .values({
        clerkUserId: userId,
        mainCurrency,
        mainCurrencyTransactions,
        mainCurrencyPercentage,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.clerkUserId,
        set: {
          mainCurrency,
          mainCurrencyTransactions,
          mainCurrencyPercentage,
          updatedAt: new Date(),
        },
      }),
  );
}

export async function processStatement(statementId: number) {
  const [stmt] = await resilientQuery(() =>
    db.select({
      userId: statements.userId,
      fileName: statements.fileName,
      fileSize: statements.fileSize,
      fileHash: statements.fileHash,
      fileData: statements.fileData,
      status: statements.status,
    }).from(statements).where(eq(statements.id, statementId)),
  );
  if (!stmt || stmt.status !== "processing") return;

  const userId = stmt.userId;
  const payload = df(stmt.fileData);
  if (!payload) {
    await db.update(statements).set({ status: "failed", aiError: ef("No file data"), aiProcessedAt: new Date() }).where(eq(statements.id, statementId));
    await markUploadLogFailed(userId, stmt.fileName, stmt.fileSize, stmt.fileHash);
    return;
  }

  let aiText: string;
  let inputTokens = 0;
  let outputTokens = 0;
  let userMainCurrency: string | null = null;
  let detectTravel: "Yes" | "No" = "Yes";

  try {
    const parsed = JSON.parse(payload);
    const fileHint = `Original file name: ${stmt.fileName}\nUse this together with the document to infer account_type (e.g. ACC_/account exports vs CC_/card exports).\n\n`;

    const [{ historyJson, subcategoryNames, travelSubcategoryNames }, userRows] = await Promise.all([
      buildUserContext(userId),
      resilientQuery(() =>
        db
          .select({ mainCurrency: users.mainCurrency, detectTravel: users.detectTravel })
          .from(users)
          .where(eq(users.clerkUserId, userId))
          .limit(1),
      ),
    ]);
    userMainCurrency = userRows[0]?.mainCurrency?.toUpperCase() ?? null;
    detectTravel = userRows[0]?.detectTravel === "No" ? "No" : "Yes";
    const compactCurrencyHint = `MC:${userMainCurrency ?? "UNKNOWN"} DT:${detectTravel}\n`;
    const historyBlock = `${MERCHANT_HISTORY_INSTRUCTIONS}${historyJson}\n\n`;
    const systemInstruction = buildSystemInstruction(
      subcategoryNames.join(", "),
      travelSubcategoryNames.join(", "),
      userMainCurrency,
      detectTravel,
    );

    if (parsed.type === "binary") {
      const result = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: parsed.mimeType, data: parsed.base64 } },
            { text: `${historyBlock}${compactCurrencyHint}${fileHint}Extract all transactions from this bank statement.` },
          ],
        }],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          temperature: 0.1,
          thinkingConfig: { thinkingBudget: 1024 },
        },
      });
      aiText = result.text ?? "";
      inputTokens = result.usageMetadata?.promptTokenCount ?? 0;
      outputTokens = result.usageMetadata?.candidatesTokenCount ?? 0;
    } else {
      const markdown = dataToMarkdownTable(parsed.headers, parsed.data);
      const result = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{
          role: "user",
          parts: [{ text: `${historyBlock}${compactCurrencyHint}${fileHint}Extract all transactions from this bank statement data:\n\n${markdown}` }],
        }],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          temperature: 0.1,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      aiText = result.text ?? "";
      inputTokens = result.usageMetadata?.promptTokenCount ?? 0;
      outputTokens = result.usageMetadata?.candidatesTokenCount ?? 0;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI call failed";
    await db.update(statements).set({ status: "failed", aiError: ef(msg), aiProcessedAt: new Date() }).where(eq(statements.id, statementId));
    await markUploadLogFailed(userId, stmt.fileName, stmt.fileSize, stmt.fileHash);
    logServerError(`process-statement/${statementId}`, err);
    return;
  }

  logAiCost({ userId, model: GEMINI_MODEL, query: "ingest", inputTokens, outputTokens }).catch(() => {});

  let aiParsed: unknown;
  try {
    aiParsed = JSON.parse(aiText);
  } catch {
    await db.update(statements).set({ status: "failed", aiError: ef("AI returned invalid JSON"), aiProcessedAt: new Date() }).where(eq(statements.id, statementId));
    await markUploadLogFailed(userId, stmt.fileName, stmt.fileSize, stmt.fileHash);
    return;
  }

  const validation = aiResponseSchema.safeParse(sanitizeAiJsonForValidation(aiParsed));
  if (!validation.success) {
    const brief =
      validation.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ") || "Schema validation failed";
    await db
      .update(statements)
      .set({ status: "failed", aiError: ef(`Schema validation failed (${brief})`), aiProcessedAt: new Date() })
      .where(eq(statements.id, statementId));
    await markUploadLogFailed(userId, stmt.fileName, stmt.fileSize, stmt.fileHash);
    return;
  }

  try {
  const aiResult = validation.data;
  let meta = { ...aiResult.account_metadata };

  const fnUpper = stmt.fileName.toUpperCase();
  // Check ACC_TXN first (longer match) before CC_TXN to avoid "ACC_TXN" matching "CC_TXN"
  const isAccFilename = /\bACC[_\s]?TXN\b|ACCOUNT[_\s]?TXN|ACCOUNT[_\s]?STATEMENT/i.test(fnUpper);
  const isCcFilename = !isAccFilename && /\bCC[_\s]?TXN\b|CARD[_\s]?TXN|CREDIT[_\s]?CARD/i.test(fnUpper);

  if (isAccFilename && (meta.account_type === "credit" || meta.account_type === "unknown")) {
    meta = { ...meta, account_type: "checking" };
  }
  if (isCcFilename && (meta.account_type === "checking" || meta.account_type === "unknown")) {
    meta = { ...meta, account_type: "credit" };
  }

  const lastFourDigits = (() => {
    const raw = meta.masked_last_four;
    if (raw == null) return undefined;
    const digits = String(raw).replace(/\D/g, "");
    if (digits.length < 2) return undefined;
    return digits.slice(-4);
  })();
  const maskedFromAi = lastFourDigits ? `••••${lastFourDigits}` : undefined;
  const cardNetworkFromAi = meta.card_network ?? undefined;

  const [currencyAccountsRaw, allCategories] = await Promise.all([
    resilientQuery(() =>
      db.select({
        id: accounts.id,
        maskedNumber: accounts.maskedNumber,
        cardNetwork: accounts.cardNetwork,
        accountType: accounts.accountType,
        institutionName: accounts.institutionName,
      })
        .from(accounts)
        .where(
          and(
            eq(accounts.userId, userId),
            eq(accounts.primaryCurrency, meta.primary_currency),
            eq(accounts.isActive, true),
          ),
        ),
    ),
    resilientQuery(() =>
      db
        .select({
          id: userCategories.id,
          name: userCategories.name,
          slug: userCategories.slug,
          parentId: userCategories.parentId,
          sortOrder: userCategories.sortOrder,
        })
        .from(userCategories)
        .where(eq(userCategories.userId, userId)),
    ),
  ]);

  // institution_name is encrypted at rest; decrypt before account matching.
  const currencyAccounts = currencyAccountsRaw.map((a) => ({
    ...a,
    institutionName: df(a.institutionName),
  }));

  const picked = pickAccountForStatement(currencyAccounts, meta, lastFourDigits);

  let accountId: string;
  if (picked) {
    accountId = picked.id;
    const updates: Record<string, string> = {};
    if (maskedFromAi && !picked.maskedNumber) updates.maskedNumber = maskedFromAi;
    if (cardNetworkFromAi && !picked.cardNetwork) updates.cardNetwork = cardNetworkFromAi;
    if (meta.institution_name && !picked.institutionName) {
      updates.institutionName = ef(meta.institution_name) ?? meta.institution_name;
    }
    if (Object.keys(updates).length > 0) {
      // Await + owner scope: fire-and-forget previously dropped unique conflicts
      // (e.g. mask already on a sibling account) with no log.
      await resilientQuery(() =>
        db
          .update(accounts)
          .set({ ...updates, updatedAt: new Date() })
          .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId))),
      ).catch((err) => logServerError(`process-statement/${statementId}/account-update`, err));
    }
  } else {
    // Race recheck is only safe when we have a masked number (unique key).
    // Without a mask, Postgres UNIQUE treats NULL masks as distinct - a bare
    // type+currency recheck would steal an unrelated masked sibling account.
    if (maskedFromAi) {
      const recheck = await resilientQuery(() =>
        db
          .select({ id: accounts.id })
          .from(accounts)
          .where(
            and(
              eq(accounts.userId, userId),
              eq(accounts.primaryCurrency, meta.primary_currency),
              eq(
                accounts.accountType,
                meta.account_type as "checking" | "savings" | "credit" | "investment" | "unknown",
              ),
              eq(accounts.maskedNumber, maskedFromAi),
            ),
          )
          .limit(1),
      );
      if (recheck.length > 0) {
        accountId = recheck[0]!.id;
      } else {
        accountId = await insertAccountWithMaskRaceRetry({
          userId,
          statementId,
          meta,
          cardNetworkFromAi,
          maskedFromAi,
        });
      }
    } else {
      const [newAccount] = await resilientQuery(() =>
        db
          .insert(accounts)
          .values({
            userId,
            accountName:
              ef(meta.institution_name ?? `${meta.primary_currency} Account`) ??
              `${meta.primary_currency} Account`,
            accountType: meta.account_type,
            cardNetwork: cardNetworkFromAi,
            primaryCurrency: meta.primary_currency,
            countryIso: meta.country_iso ?? undefined,
            institutionName: ef(meta.institution_name ?? null) ?? undefined,
            maskedNumber: undefined,
          })
          .returning({ id: accounts.id }),
      );
      accountId = newAccount.id;
    }
  }

  const categorySlugMap = new Map<string, number>();
  const categoryNameToIds = new Map<string, number[]>();
  const categoryNameById = new Map<number, string>();
  const categorySlugById = new Map<number, string>();
  const leafCategories = allCategories.filter((c) => c.parentId != null);
  for (const cat of allCategories) {
    categorySlugMap.set(cat.slug.toLowerCase(), cat.id);
    const lowerName = cat.name.toLowerCase();
    const ids = categoryNameToIds.get(lowerName) ?? [];
    ids.push(cat.id);
    categoryNameToIds.set(lowerName, ids);
    categoryNameById.set(cat.id, cat.name);
    categorySlugById.set(cat.id, cat.slug);
  }

  const uniqueNameMap = new Map<string, number>();
  for (const [name, ids] of categoryNameToIds.entries()) {
    if (ids.length === 1) uniqueNameMap.set(name, ids[0]);
  }

  // Strict server-side guard: AI suggestions must resolve to an existing Neon category.
  // Resolution order: exact slug -> unique category name. Ambiguous names are rejected.
  function resolveExistingCategoryId(
    suggestion: string | null | undefined,
    options?: { allowFallback?: boolean },
  ): number | undefined {
    const allowFallback = options?.allowFallback ?? false;
    const key = (suggestion ?? "").trim().toLowerCase();
    if (!key) return allowFallback ? leafCategories[0]?.id ?? allCategories[0]?.id : undefined;
    const bySlug = categorySlugMap.get(key);
    if (bySlug) return bySlug;
    const byUniqueName = uniqueNameMap.get(key);
    if (byUniqueName) return byUniqueName;
    return allowFallback ? leafCategories[0]?.id ?? allCategories[0]?.id : undefined;
  }

  // Hard server-side enforcement: if detectTravel is enabled and the FX/base rules match,
  // force category_suggestion into Travel (LLM prompt remains advisory, this is deterministic).
  const travelParentIds = new Set(
    allCategories
      .filter((c) => c.parentId == null && (c.name.toLowerCase() === "travel" || c.slug === "travel"))
      .map((c) => c.id),
  );
  const travelChildren = allCategories
    .filter((c) => c.parentId != null && travelParentIds.has(c.parentId))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const travelNameSet = new Set(travelChildren.map((c) => c.name.toLowerCase()));
  const travelSlugSet = new Set(travelChildren.map((c) => c.slug));
  const travelOtherChild =
    travelChildren.find((c) => /\bother\b/i.test(c.name) || /\bother\b/.test(c.slug)) ??
    travelChildren[travelChildren.length - 1] ??
    null;

  const bestTravelSubcategory = buildTravelMatcher(travelChildren, travelOtherChild?.slug ?? null);

  if (travelChildren.length > 0) {
    for (const txn of aiResult.transactions) {
      if (!isTravelOverrideMatch(txn, detectTravel, userMainCurrency)) continue;
      const suggested = txn.category_suggestion?.toLowerCase() ?? "";
      const alreadyTravel = travelNameSet.has(suggested) || travelSlugSet.has(suggested) || suggested === "travel";
      if (!alreadyTravel) {
        txn.category_suggestion = bestTravelSubcategory(txn.category_suggestion ?? "");
      }
    }
  }

  // Final normalization: force every AI category suggestion into an existing Neon category.
  for (const txn of aiResult.transactions) {
    const resolvedId = resolveExistingCategoryId(txn.category_suggestion);
    if (!resolvedId) continue;
    txn.category_suggestion =
      categorySlugById.get(resolvedId) ?? categoryNameById.get(resolvedId) ?? txn.category_suggestion;
  }

  const uniqueMerchants = new Map<string, { canonical: string; mcc?: number; country?: string; catId?: number }>();
  for (const txn of aiResult.transactions) {
    if (!txn.merchant_name) continue;
    const canonical = canonicalizeMerchant(txn.merchant_name);
    if (!canonical) continue;
    const key = canonical.toLowerCase();
    if (!uniqueMerchants.has(key)) {
      uniqueMerchants.set(key, {
        canonical,
        mcc: txn.mcc_code ?? undefined,
        country: txn.country_iso ?? undefined,
        catId: resolveExistingCategoryId(txn.category_suggestion),
      });
    }
  }

  const merchantIdCache = new Map<string, number>();
  if (uniqueMerchants.size > 0) {
    await resilientQuery(() =>
      db.insert(merchants).values(
        Array.from(uniqueMerchants.values()).map((m) => ({
          canonicalName: m.canonical, mccCode: m.mcc, countryIso: m.country, categoryId: m.catId, transactionCount: 1,
        })),
      ).onConflictDoNothing(),
    );
    const merchantNames = Array.from(uniqueMerchants.values()).map((m) => m.canonical);
    const matchedMerchants = await resilientQuery(() =>
      db
        .select({ id: merchants.id, canonicalName: merchants.canonicalName })
        .from(merchants)
        .where(inArray(merchants.canonicalName, merchantNames)),
    );
    for (const m of matchedMerchants) merchantIdCache.set(m.canonicalName.toLowerCase(), m.id);
  }

  const BATCH_SIZE = 100;
  let imported = 0;
  let duplicates = 0;

  await ensureTransactionWarningFlagColumn();
  const warningRuleRows = await resilientQuery(() =>
    db
      .select({ merchantName: merchantWarningRules.merchantName })
      .from(merchantWarningRules)
      .where(eq(merchantWarningRules.userId, userId)),
  );
  const warnedMerchants = new Set(
    warningRuleRows.map((row) => row.merchantName.trim().toLowerCase()).filter(Boolean),
  );
  const labelRuleRows = await resilientQuery(() =>
    db
      .select({
        merchantName: merchantLabelRules.merchantName,
        label: merchantLabelRules.label,
      })
      .from(merchantLabelRules)
      .where(eq(merchantLabelRules.userId, userId)),
  );
  const labelsByMerchant = new Map(
    labelRuleRows
      .map((row) => [row.merchantName.trim().toLowerCase(), row.label.trim().slice(0, 20)] as const)
      .filter(([merchantName, label]) => merchantName && label),
  );

  const signatures = aiResult.transactions.map((txn) =>
    buildDedupeSignature(txn.posted_date, txn.base_amount, txn.raw_description),
  );
  const occurrenceIndices = assignOccurrenceIndices(signatures);

  const txnRows = aiResult.transactions.map((txn, idx) => {
    const catId = resolveExistingCategoryId(txn.category_suggestion);
    const merchantName = txn.merchant_name?.toLowerCase();
    const normalizedMerchantName = merchantName?.trim().toLowerCase() ?? "";
    const merchantId = txn.merchant_name ? merchantIdCache.get(canonicalizeMerchant(txn.merchant_name).toLowerCase()) : undefined;
    const rawDescription = txn.raw_description.trim();
    const referenceId = sanitizeAiReferenceId(txn.reference_id, txn.merchant_name ?? null, txn.raw_description);
    // Persist only strong refs; weak reused codes stay null so they cannot mislead future logic.
    const storedRef = referenceId && isStrongReferenceId(referenceId) ? referenceId : undefined;
    return {
      userId, accountId, statementId,
      postedDate: txn.posted_date,
      rawDescription,
      dedupeSignature: signatures[idx],
      occurrenceIndex: occurrenceIndices[idx],
      referenceId: storedRef,
      merchantName: merchantName ?? undefined, merchantId: merchantId ?? undefined,
      categoryId: catId,
      categoryConfidence: txn.confidence?.toString(),
      baseAmount: txn.base_amount.toString(), baseCurrency: txn.base_currency,
      foreignAmount: txn.foreign_amount?.toString() ?? undefined,
      foreignCurrency: txn.foreign_currency ?? undefined,
      implicitFxRate: txn.implicit_fx_rate?.toString() ?? undefined,
      countryIso: txn.country_iso ?? undefined,
      isRecurring: txn.is_recurring,
      warningFlag: normalizedMerchantName ? warnedMerchants.has(normalizedMerchantName) : false,
      label: normalizedMerchantName ? labelsByMerchant.get(normalizedMerchantName) : undefined,
      aiConfidence: txn.confidence?.toString(),
    };
  });

  // Strong bank references uniquely identify a transaction. The SAME reference can
  // resurface with a different date column (Transaction Date vs Posting Date), a
  // reworded description, or even under a SECOND account record for the same card
  // (e.g. the masked number was extracted on one ingest but not another). Dedupe on
  // (reference, signed amount) both WITHIN this batch AND against every existing
  // transaction for the user (not just this account) so none of that variance can
  // double-load a row. Signed amount (not absolute) keeps the two legitimate sides of
  // a transfer (+X / -X) that happen to share a reference as distinct rows.
  const refIdentity = (ref: string, signedAmount: number | string) =>
    `${ref}\u0000${normalizeBaseAmount(signedAmount)}`;

  const strongRefs = [...new Set(txnRows.map((r) => r.referenceId).filter(Boolean))] as string[];
  const existingRefKeys = new Set<string>();
  if (strongRefs.length > 0) {
    const existingRefs = await resilientQuery(() =>
      db
        .select({
          referenceId: transactions.referenceId,
          baseAmount: transactions.baseAmount,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            inArray(transactions.referenceId, strongRefs),
          ),
        ),
    );
    for (const row of existingRefs) {
      if (row.referenceId) {
        existingRefKeys.add(refIdentity(row.referenceId, row.baseAmount));
      }
    }
  }

  const seenRefKeys = new Set<string>();
  const rowsToInsert = txnRows.filter((r) => {
    if (!r.referenceId) return true;
    const key = refIdentity(r.referenceId, r.baseAmount);
    if (existingRefKeys.has(key) || seenRefKeys.has(key)) return false;
    seenRefKeys.add(key);
    return true;
  });
  const softRefDupes = txnRows.length - rowsToInsert.length;

  const batches: typeof rowsToInsert[] = [];
  for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
    batches.push(rowsToInsert.slice(i, i + BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map(async (batch) => {
      if (batch.length === 0) return { imported: 0, duplicates: 0 };
      const result = await resilientQuery(() =>
        db.insert(transactions).values(batch)
          .onConflictDoNothing({
            target: [transactions.accountId, transactions.dedupeSignature, transactions.occurrenceIndex],
          })
          .returning({ id: transactions.id }),
      );
      return { imported: result.length, duplicates: batch.length - result.length };
    }),
  );
  for (const r of results) {
    imported += r.imported;
    duplicates += r.duplicates;
  }
  duplicates += softRefDupes;

  await updateUserMainCurrency(userId);

  const extractedCount = aiResult.transactions.length;
  if (extractedCount === 0) {
    await db.update(statements).set({
      status: "failed",
      aiError: ef("No transactions extracted from this statement"),
      aiProcessedAt: new Date(),
    }).where(eq(statements.id, statementId));
    await markUploadLogFailed(userId, stmt.fileName, stmt.fileSize, stmt.fileHash);
    return;
  }

  if (imported === 0 && duplicates === 0) {
    await db.update(statements).set({
      status: "failed",
      aiError: ef("Could not import any transactions from this statement"),
      aiProcessedAt: new Date(),
    }).where(eq(statements.id, statementId));
    await markUploadLogFailed(userId, stmt.fileName, stmt.fileSize, stmt.fileHash);
    return;
  }

  await db.update(statements).set({
    status: "completed", aiModel: GEMINI_MODEL, aiProcessedAt: new Date(),
    accountId, transactionsImported: imported, transactionsDuplicate: duplicates,
    periodStart: meta.statement_period_start ?? undefined,
    periodEnd: meta.statement_period_end ?? undefined,
    fileData: null,
  }).where(eq(statements.id, statementId));
  } catch (persistErr) {
    const msg = persistErr instanceof Error ? persistErr.message : String(persistErr);
    const truncated = msg.length > 2000 ? `${msg.slice(0, 2000)}…` : msg;
    await db
      .update(statements)
      .set({ status: "failed", aiError: ef(truncated), aiProcessedAt: new Date() })
      .where(eq(statements.id, statementId));
    await markUploadLogFailed(userId, stmt.fileName, stmt.fileSize, stmt.fileHash);
    logServerError(`process-statement/${statementId}`, persistErr);
  }
}
