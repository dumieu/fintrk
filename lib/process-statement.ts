import "server-only";
import { db, resilientQuery } from "@/lib/db";
import { accounts, transactions, statements, userCategories, merchants, fileUploadLog } from "@/lib/db/schema";
import { ensureUserCategories } from "@/lib/ensure-user-categories";
import { ai, GEMINI_MODEL } from "@/lib/gemini";
import { logAiCost } from "@/lib/ai-cost";
import { logServerError } from "@/lib/safe-error";
import { aiResponseSchema } from "@/lib/validations/ingest";
import { eq, and, sql } from "drizzle-orm";

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
        .select({ id: userCategories.id, name: userCategories.name, parentId: userCategories.parentId })
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
        .innerJoin(userCategories, eq(transactions.categoryId, userCategories.id))
        .where(
          sql`${transactions.userId} = ${userId}
            AND ${transactions.merchantName} IS NOT NULL
            AND TRIM(${transactions.merchantName}) != ''`,
        )
        .groupBy(userCategories.name, transactions.merchantName),
    ),
  ]);

  const parentById = new Map<number, { name: string; parentId: number | null }>();
  for (const c of allCats) parentById.set(c.id, { name: c.name, parentId: c.parentId });

  const tree: Record<string, Record<string, Set<string>>> = {};
  const subcategoryNames: string[] = [];

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
        subcategoryNames.push(c.name.trim());
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

  return { historyJson: JSON.stringify(result), subcategoryNames };
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

function buildSystemInstruction(subcategoryList: string): string {
  return `You are FinTRK, a financial statement (credit card, debit card, checking account) data extraction engine. You receive bank statement data (as a markdown table or as a PDF/image) and extract every transaction into a strictly structured JSON array.

For EACH transaction, you MUST:

1. DATES: Extract posted_date (YYYY-MM-DD).

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
   - category_suggestion: your best category from this exact list: ${subcategoryList}
     IMPORTANT: To determine the correct category, you MUST analyze the ENTIRE raw_description — not only the merchant name. Transaction descriptions often contain keywords like "rental", "groceries", "salary", "insurance", "transfer", "loan", "utilities", "dining", "fuel", etc. that are strong category signals. Always use every available clue from the full description text, any embedded notes, and the merchant name together to pick the most accurate category.

SPECIAL CATEGORY RULES (apply BEFORE general classification):

   A) CARD PAYMENTS — category "Other Misc" → subcategory "Card Payments":
      On CREDIT CARD statements: look for POSITIVE (credit) transactions that are payments made TO the credit card to reduce the outstanding balance. These typically appear as "PAYMENT RECEIVED", "PAYMENT THANK YOU", "AUTOPAY", "PAYMENT - THANK YOU", "ONLINE PAYMENT", "MOBILE PAYMENT", "PAYMENT FROM CHECKING", "BILL PAYMENT", "CR ADJUSTMENT", or similar bank-generated descriptions — NOT merchant purchases. If you are confident the transaction is a payment toward the credit card balance, assign category_suggestion = "Card Payments" (the subcategory under "Other Misc").
      On CHECKING / DEBIT CARD statements: look for NEGATIVE (debit) transactions that are payments made FROM the checking account TO a credit card. These typically appear as "CREDIT CARD PAYMENT", "CC PAYMENT", "CARD PAYMENT", "PAYMENT TO VISA", "PAYMENT TO MASTERCARD", "PAYMENT TO AMEX", "PAY CREDIT CARD", or the bank's own credit card product name. If you are confident the transaction is a payment toward a credit card, assign category_suggestion = "Card Payments".
      Do NOT tag regular merchant purchases as Card Payments — only balance payments / transfers between the user's own accounts.

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
 * Multi-tier account matching. Each tier is strictly gated — we never
 * fall through to a looser match if a tighter one was possible.
 *
 * Tier 1: exact type + exact last-four digits
 * Tier 2: exact type + same institution (only when statement has NO last-four)
 * Tier 3: exact type, single candidate (only when statement has NO last-four)
 *
 * Returns undefined → caller MUST create a new account.
 */
function pickAccountForStatement(
  rows: AccountPickRow[],
  meta: { account_type: string; institution_name?: string | null | undefined },
  statementLastFour: string | undefined,
): AccountPickRow | undefined {
  const sameType = (a: AccountPickRow) => a.accountType === meta.account_type;

  // Tier 1: type + last-four match
  if (statementLastFour) {
    const byDigits = rows.filter(
      (a) => sameType(a) && lastFourFromStoredMasked(a.maskedNumber) === statementLastFour,
    );
    if (byDigits.length >= 1) return byDigits[0];
    // If we have a last-four from the statement but no existing account matches,
    // do NOT fall through — this is a distinct account that needs to be created.
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

async function markUploadLogFailed(userId: string, fileName: string, fileSize: number, fileHash: string | null) {
  await db.update(fileUploadLog)
    .set({ outcome: "failed" })
    .where(
      and(
        eq(fileUploadLog.userId, userId),
        eq(fileUploadLog.fileName, fileName),
        eq(fileUploadLog.fileSize, fileSize),
      ),
    ).catch(() => {});
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
  const payload = stmt.fileData;
  if (!payload) {
    await db.update(statements).set({ status: "failed", aiError: "No file data" }).where(eq(statements.id, statementId));
    await markUploadLogFailed(userId, stmt.fileName, stmt.fileSize, stmt.fileHash);
    return;
  }

  let aiText: string;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const parsed = JSON.parse(payload);
    const fileHint = `Original file name: ${stmt.fileName}\nUse this together with the document to infer account_type (e.g. ACC_/account exports vs CC_/card exports).\n\n`;

    const { historyJson, subcategoryNames } = await buildUserContext(userId);
    const historyBlock = `${MERCHANT_HISTORY_INSTRUCTIONS}${historyJson}\n\n`;
    const systemInstruction = buildSystemInstruction(subcategoryNames.join(", "));

    if (parsed.type === "binary") {
      const result = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: parsed.mimeType, data: parsed.base64 } },
            { text: `${historyBlock}${fileHint}Extract all transactions from this bank statement.` },
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
          parts: [{ text: `${historyBlock}${fileHint}Extract all transactions from this bank statement data:\n\n${markdown}` }],
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
    await db.update(statements).set({ status: "failed", aiError: msg }).where(eq(statements.id, statementId));
    await markUploadLogFailed(userId, stmt.fileName, stmt.fileSize, stmt.fileHash);
    logServerError(`process-statement/${statementId}`, err);
    return;
  }

  db.update(statements).set({ fileData: null }).where(eq(statements.id, statementId)).catch(() => {});
  logAiCost({ userId, model: GEMINI_MODEL, query: "ingest", inputTokens, outputTokens }).catch(() => {});

  let aiParsed: unknown;
  try { aiParsed = JSON.parse(aiText); } catch {
    await db.update(statements).set({ status: "failed", aiError: "AI returned invalid JSON" }).where(eq(statements.id, statementId));
    await markUploadLogFailed(userId, stmt.fileName, stmt.fileSize, stmt.fileHash);
    return;
  }

  const validation = aiResponseSchema.safeParse(aiParsed);
  if (!validation.success) {
    await db.update(statements).set({ status: "failed", aiError: "Schema validation failed" }).where(eq(statements.id, statementId));
    await markUploadLogFailed(userId, stmt.fileName, stmt.fileSize, stmt.fileHash);
    return;
  }

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

  const [currencyAccounts, allCategories] = await Promise.all([
    resilientQuery(() =>
      db.select({
        id: accounts.id,
        maskedNumber: accounts.maskedNumber,
        cardNetwork: accounts.cardNetwork,
        accountType: accounts.accountType,
        institutionName: accounts.institutionName,
      })
        .from(accounts)
        .where(and(eq(accounts.userId, userId), eq(accounts.primaryCurrency, meta.primary_currency))),
    ),
    resilientQuery(() =>
      db
        .select({ id: userCategories.id, name: userCategories.name, slug: userCategories.slug })
        .from(userCategories)
        .where(eq(userCategories.userId, userId)),
    ),
  ]);

  const picked = pickAccountForStatement(currencyAccounts, meta, lastFourDigits);

  let accountId: string;
  if (picked) {
    accountId = picked.id;
    const updates: Record<string, string> = {};
    if (maskedFromAi && !picked.maskedNumber) updates.maskedNumber = maskedFromAi;
    if (cardNetworkFromAi && !picked.cardNetwork) updates.cardNetwork = cardNetworkFromAi;
    if (meta.institution_name && !picked.institutionName) {
      updates.institutionName = meta.institution_name;
    }
    if (Object.keys(updates).length > 0) {
      db.update(accounts).set(updates).where(eq(accounts.id, accountId)).catch(() => {});
    }
  } else {
    // Re-query right before insert to guard against a parallel insert
    // that snuck in between the initial query and now.
    const recheck = await resilientQuery(() =>
      db.select({ id: accounts.id })
        .from(accounts)
        .where(
          and(
            eq(accounts.userId, userId),
            eq(accounts.primaryCurrency, meta.primary_currency),
            eq(accounts.accountType, meta.account_type as "checking" | "savings" | "credit" | "investment" | "unknown"),
            ...(maskedFromAi ? [eq(accounts.maskedNumber, maskedFromAi)] : []),
          ),
        )
        .limit(1),
    );

    if (recheck.length > 0) {
      accountId = recheck[0].id;
    } else {
      try {
        const [newAccount] = await resilientQuery(() =>
          db.insert(accounts).values({
            userId,
            accountName: meta.institution_name ?? `${meta.primary_currency} Account`,
            accountType: meta.account_type,
            cardNetwork: cardNetworkFromAi,
            primaryCurrency: meta.primary_currency,
            countryIso: meta.country_iso ?? undefined,
            institutionName: meta.institution_name ?? undefined,
            maskedNumber: maskedFromAi,
          }).returning({ id: accounts.id }),
        );
        accountId = newAccount.id;
      } catch (insertErr: unknown) {
        const isDuplicate = insertErr instanceof Error && insertErr.message.includes("unique");
        if (!isDuplicate) throw insertErr;
        const [existing] = await resilientQuery(() =>
          db.select({ id: accounts.id })
            .from(accounts)
            .where(
              and(
                eq(accounts.userId, userId),
                eq(accounts.primaryCurrency, meta.primary_currency),
                eq(accounts.accountType, meta.account_type as "checking" | "savings" | "credit" | "investment" | "unknown"),
                ...(maskedFromAi ? [eq(accounts.maskedNumber, maskedFromAi)] : []),
              ),
            )
            .limit(1),
        );
        accountId = existing.id;
      }
    }
  }

  const categoryMap = new Map<string, number>();
  for (const cat of allCategories) {
    categoryMap.set(cat.name.toLowerCase(), cat.id);
    categoryMap.set(cat.slug, cat.id);
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
        catId: txn.category_suggestion ? categoryMap.get(txn.category_suggestion.toLowerCase()) : undefined,
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
    const allMerchants = await resilientQuery(() =>
      db.select({ id: merchants.id, canonicalName: merchants.canonicalName }).from(merchants),
    );
    for (const m of allMerchants) merchantIdCache.set(m.canonicalName.toLowerCase(), m.id);
  }

  const BATCH_SIZE = 100;
  let imported = 0;
  let duplicates = 0;

  const txnRows = aiResult.transactions.map((txn) => {
    const catId = txn.category_suggestion ? categoryMap.get(txn.category_suggestion.toLowerCase()) : undefined;
    const merchantId = txn.merchant_name ? merchantIdCache.get(canonicalizeMerchant(txn.merchant_name).toLowerCase()) : undefined;
    return {
      userId, accountId, statementId,
      postedDate: txn.posted_date,
      rawDescription: txn.raw_description,
      referenceId: sanitizeAiReferenceId(txn.reference_id, txn.merchant_name ?? null, txn.raw_description),
      merchantName: txn.merchant_name?.toLowerCase() ?? undefined, merchantId: merchantId ?? undefined,
      categoryId: catId,
      categoryConfidence: txn.confidence?.toString(),
      baseAmount: txn.base_amount.toString(), baseCurrency: txn.base_currency,
      foreignAmount: txn.foreign_amount?.toString() ?? undefined,
      foreignCurrency: txn.foreign_currency ?? undefined,
      implicitFxRate: txn.implicit_fx_rate?.toString() ?? undefined,
      countryIso: txn.country_iso ?? undefined,
      isRecurring: txn.is_recurring, aiConfidence: txn.confidence?.toString(),
    };
  });

  const batches: typeof txnRows[] = [];
  for (let i = 0; i < txnRows.length; i += BATCH_SIZE) {
    batches.push(txnRows.slice(i, i + BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map(async (batch) => {
      try {
        const result = await resilientQuery(() =>
          db.insert(transactions).values(batch)
            .onConflictDoNothing({ target: [transactions.accountId, transactions.postedDate, transactions.baseAmount, transactions.rawDescription] })
            .returning({ id: transactions.id }),
        );
        return { imported: result.length, duplicates: batch.length - result.length };
      } catch {
        return { imported: 0, duplicates: batch.length };
      }
    }),
  );
  for (const r of results) {
    imported += r.imported;
    duplicates += r.duplicates;
  }

  await db.update(statements).set({
    status: "completed", aiModel: GEMINI_MODEL, aiProcessedAt: new Date(),
    accountId, transactionsImported: imported, transactionsDuplicate: duplicates,
    periodStart: meta.statement_period_start ?? undefined,
    periodEnd: meta.statement_period_end ?? undefined,
    fileData: null,
  }).where(eq(statements.id, statementId));
}
