import { NextRequest, NextResponse } from "next/server";
import { db, resilientQuery } from "@/lib/db";
import { accounts, transactions, statements, categories, merchants } from "@/lib/db/schema";
import { ai, GEMINI_MODEL } from "@/lib/gemini";
import { logAiCost } from "@/lib/ai-cost";
import { logServerError } from "@/lib/safe-error";
import { aiResponseSchema } from "@/lib/validations/ingest";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NO_STORE = { "Cache-Control": "no-store" } as const;

const SYSTEM_INSTRUCTION = `You are FinTRK, a financial data extraction engine. You receive bank statement data (as a markdown table or as a PDF/image) and extract every transaction into a strictly structured JSON array.

For EACH transaction, you MUST:

1. DATES: Extract posted_date (YYYY-MM-DD). If a separate "value date" exists, extract value_date. If only one date column exists, use it for both.

2. DESCRIPTIONS:
   - raw_description: exact text from the statement, unmodified
   - clean_description: human-readable version (strip reference numbers, codes, terminal IDs — keep only the meaningful merchant/purpose text)
   - merchant_name: the canonical merchant name (e.g., "AMZN*2847362" → "Amazon", "UBER *EATS" → "Uber Eats", "DD *DOORDASH" → "DoorDash")

3. AMOUNTS:
   - base_amount: transaction amount in the account's primary currency. NEGATIVE for debits/expenses, POSITIVE for credits/income.
   - base_currency: ISO 4217 code of the account's primary currency
   - If a foreign currency amount is present:
     - foreign_amount: the amount in foreign currency (always positive)
     - foreign_currency: ISO 4217 code
     - implicit_fx_rate: the implied exchange rate (base_amount / foreign_amount)

4. CLASSIFICATION:
   - mcc_code: Merchant Category Code (4-digit integer) if determinable from merchant name, null otherwise
   - country_iso: ISO 3166-1 alpha-2 country code, inferred from explicit country indicators, currency, or merchant name recognition. Default to the account's country if ambiguous.
   - category_suggestion: your best category from this exact list: Salary, Freelance, Investment Returns, Refunds, Side Income, Rent / Mortgage, Utilities, Insurance, Maintenance, Property Tax, Fuel, Public Transit, Ride Share, Parking, Car Payment, Car Insurance, Groceries, Restaurants, Coffee, Delivery, Bars & Nightlife, Clothing, Electronics, Home & Garden, Personal Care, Online Shopping, Streaming, Gaming, Events & Concerts, Hobbies, Books & Media, Medical, Pharmacy, Fitness, Health Insurance, Mental Health, Bank Fees, Interest Charges, FX Fees, Investment Fees, ATM Fees, Flights, Hotels, Activities, Travel Insurance, Car Rental, Tuition, Books & Supplies, Courses & Certifications, Charity, Gifts, Religious, Internal Transfer, Loan Payment, Credit Card Payment, Savings Transfer, ATM Withdrawal, Cash, Miscellaneous, Uncategorized

5. PATTERNS:
   - is_recurring: true if this merchant appears to charge on a regular schedule (subscriptions, rent, salary, insurance, loan payments)
   - confidence: 0.0 to 1.0 — your confidence in the overall extraction quality

RESPONSE FORMAT: Return ONLY valid JSON with this exact shape:
{
  "account_metadata": {
    "institution_name": string | null,
    "account_type": "checking" | "savings" | "credit" | "investment" | "unknown",
    "primary_currency": string,
    "country_iso": string | null,
    "statement_period_start": string | null,
    "statement_period_end": string | null
  },
  "transactions": [...]
}`;

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
    .trim();
}

async function processStatement(statementId: number) {
  const [stmt] = await resilientQuery(() =>
    db.select().from(statements).where(eq(statements.id, statementId)),
  );
  if (!stmt || stmt.status !== "processing") return;

  const userId = stmt.userId;
  const payload = stmt.fileData;
  if (!payload) {
    await db.update(statements).set({ status: "failed", aiError: "No file data" }).where(eq(statements.id, statementId));
    return;
  }

  let aiText: string;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const parsed = JSON.parse(payload);

    if (parsed.type === "binary") {
      const result = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: parsed.mimeType, data: parsed.base64 } },
            { text: "Extract all transactions from this bank statement." },
          ],
        }],
        config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: "application/json", temperature: 0.1 },
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
          parts: [{ text: `Extract all transactions from this bank statement data:\n\n${markdown}` }],
        }],
        config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: "application/json", temperature: 0.1 },
      });
      aiText = result.text ?? "";
      inputTokens = result.usageMetadata?.promptTokenCount ?? 0;
      outputTokens = result.usageMetadata?.candidatesTokenCount ?? 0;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI call failed";
    await db.update(statements).set({ status: "failed", aiError: msg }).where(eq(statements.id, statementId));
    logServerError(`process-statement/${statementId}`, err);
    return;
  }

  await logAiCost({ userId, model: GEMINI_MODEL, query: "ingest", inputTokens, outputTokens });

  let aiParsed: unknown;
  try { aiParsed = JSON.parse(aiText); } catch {
    await db.update(statements).set({ status: "failed", aiError: "AI returned invalid JSON" }).where(eq(statements.id, statementId));
    return;
  }

  const validation = aiResponseSchema.safeParse(aiParsed);
  if (!validation.success) {
    await db.update(statements).set({ status: "failed", aiError: "Schema validation failed" }).where(eq(statements.id, statementId));
    return;
  }

  const aiResult = validation.data;
  const meta = aiResult.account_metadata;

  let accountId: string;
  const existingAccounts = await resilientQuery(() =>
    db.select({ id: accounts.id }).from(accounts).where(
      and(eq(accounts.userId, userId), eq(accounts.primaryCurrency, meta.primary_currency)),
    ),
  );

  if (existingAccounts.length > 0) {
    accountId = existingAccounts[0].id;
  } else {
    const [newAccount] = await resilientQuery(() =>
      db.insert(accounts).values({
        userId,
        accountName: meta.institution_name ?? `${meta.primary_currency} Account`,
        accountType: meta.account_type,
        primaryCurrency: meta.primary_currency,
        countryIso: meta.country_iso ?? undefined,
        institutionName: meta.institution_name ?? undefined,
      }).returning({ id: accounts.id }),
    );
    accountId = newAccount.id;
  }

  const categoryMap = new Map<string, number>();
  const allCategories = await resilientQuery(() => db.select().from(categories));
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

  const BATCH_SIZE = 50;
  let imported = 0;
  let duplicates = 0;

  const txnRows = aiResult.transactions.map((txn) => {
    const catId = txn.category_suggestion ? categoryMap.get(txn.category_suggestion.toLowerCase()) : undefined;
    const merchantId = txn.merchant_name ? merchantIdCache.get(canonicalizeMerchant(txn.merchant_name).toLowerCase()) : undefined;
    return {
      userId, accountId, statementId,
      postedDate: txn.posted_date, valueDate: txn.value_date ?? undefined,
      rawDescription: txn.raw_description, cleanDescription: txn.clean_description,
      merchantName: txn.merchant_name ?? undefined, merchantId: merchantId ?? undefined,
      mccCode: txn.mcc_code ?? undefined, categoryId: catId,
      categorySuggestion: txn.category_suggestion ?? undefined,
      categoryConfidence: txn.confidence?.toString(),
      baseAmount: txn.base_amount.toString(), baseCurrency: txn.base_currency,
      foreignAmount: txn.foreign_amount?.toString() ?? undefined,
      foreignCurrency: txn.foreign_currency ?? undefined,
      implicitFxRate: txn.implicit_fx_rate?.toString() ?? undefined,
      countryIso: txn.country_iso ?? undefined,
      isRecurring: txn.is_recurring, aiConfidence: txn.confidence?.toString(),
    };
  });

  for (let i = 0; i < txnRows.length; i += BATCH_SIZE) {
    const batch = txnRows.slice(i, i + BATCH_SIZE);
    try {
      const result = await resilientQuery(() =>
        db.insert(transactions).values(batch)
          .onConflictDoNothing({ target: [transactions.accountId, transactions.postedDate, transactions.baseAmount, transactions.rawDescription] })
          .returning({ id: transactions.id }),
      );
      imported += result.length;
      duplicates += batch.length - result.length;
    } catch {
      duplicates += batch.length;
    }
  }

  await db.update(statements).set({
    status: "completed", aiModel: GEMINI_MODEL, aiProcessedAt: new Date(),
    accountId, transactionsImported: imported, transactionsDuplicate: duplicates,
    periodStart: meta.statement_period_start ?? undefined,
    periodEnd: meta.statement_period_end ?? undefined,
    fileData: null,
  }).where(eq(statements.id, statementId));
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-internal-secret");
  if (secret !== (process.env.CRON_SECRET || "fintrk-internal")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  try {
    const { statementId } = await request.json();
    if (typeof statementId !== "number") {
      return NextResponse.json({ error: "Invalid statementId" }, { status: 400, headers: NO_STORE });
    }

    await processStatement(statementId);

    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (err) {
    logServerError("api/ingest/process", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500, headers: NO_STORE });
  }
}
