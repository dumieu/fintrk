import assert from "node:assert/strict";
import test from "node:test";

import { coerceAmount, coerceIsoDate, interpretAiStatement } from "./ai-statement-parse";

const meta = {
  account_type: "credit",
  primary_currency: "USD",
  statement_period_start: "2026-07-01",
  statement_period_end: "2026-07-31",
};

test("null header and total rows are dropped and the real lines import", () => {
  const raw = JSON.stringify({
    account_metadata: meta,
    transactions: [
      {
        posted_date: null,
        raw_description: "PREVIOUS BALANCE",
        base_amount: null,
        base_currency: "USD",
      },
      {
        posted_date: "2026-07-04",
        raw_description: "AMAZON",
        merchant_name: "amazon",
        base_amount: "-1,234.56",
        base_currency: "usd",
      },
      {
        posted_date: "04 Jul 2026",
        raw_description: "PAYROLL",
        base_amount: 2500,
        base_currency: "USD",
      },
      {
        posted_date: null,
        raw_description: "STATEMENT TOTAL",
        base_amount: -20,
        base_currency: "USD",
      },
    ],
  });

  const result = interpretAiStatement(raw);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.transactions.length, 2);
  assert.equal(result.data.transactions[0]!.posted_date, "2026-07-04");
  assert.equal(result.data.transactions[0]!.base_amount, -1234.56);
  assert.equal(result.data.transactions[0]!.base_currency, "USD");
  assert.equal(result.data.transactions[1]!.posted_date, "2026-07-04");
  assert.equal(result.data.transactions[1]!.base_amount, 2500);
});

test("truncated JSON keeps the complete transactions", () => {
  const text = `\`\`\`json
{"account_metadata":{"account_type":"credit","primary_currency":"USD","statement_period_start":"2026-06-01","statement_period_end":"2026-06-30"},"transactions":[{"posted_date":"2026-06-02","raw_description":"STORE","base_amount":-10.5,"base_currency":"USD"},{"posted_date":"2026-06-03","raw_description":"CUT OFF
`;
  const result = interpretAiStatement(text);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.transactions.length, 1);
  assert.equal(result.data.transactions[0]!.raw_description, "STORE");
  assert.equal(result.data.account_metadata.primary_currency, "USD");
});

test("trailing commas and a fenced payload still parse", () => {
  const text = "```json\n{\"account_metadata\":{\"account_type\":\"Credit Card\",\"primary_currency\":\"EUR\",},\"transactions\":[{\"posted_date\":\"2026-08-01\",\"raw_description\":\"CAFE\",\"base_amount\":\"(12,50)\",\"base_currency\":\"EUR\",},],}\n```";
  const result = interpretAiStatement(text);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.account_metadata.account_type, "credit");
  assert.equal(result.data.transactions[0]!.base_amount, -12.5);
});

test("a statement with no usable lines imports nothing", () => {
  const result = interpretAiStatement(
    JSON.stringify({
      account_metadata: meta,
      transactions: [{ posted_date: null, raw_description: "TOTAL", base_amount: null }],
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.transactions.length, 0);
});

test("date and amount coercion", () => {
  assert.equal(coerceIsoDate("15/07/2026"), "2026-07-15");
  assert.equal(coerceIsoDate("07/15/2026"), "2026-07-15");
  assert.equal(coerceIsoDate("01/07/2026"), null);
  assert.equal(
    coerceIsoDate("01/07/2026", { start: "2026-07-01", end: "2026-07-31" }),
    "2026-07-01",
  );
  assert.equal(coerceAmount("1.234,56"), 1234.56);
  assert.equal(coerceAmount("1,234"), 1234);
  assert.equal(coerceAmount(null), null);
});
