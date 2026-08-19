/** Create the two Fin AI tables up front so the first chat request does no DDL.
 *  Idempotent - safe to run repeatedly.
 *    npx tsx scripts/fin-ai-bootstrap.ts */
import { config } from "dotenv";
config({ path: ".env.local" });

import { Module } from "module";
const origResolve = (
  Module as unknown as { _resolveFilename: (...a: unknown[]) => string }
)._resolveFilename;
(
  Module as unknown as { _resolveFilename: (...a: unknown[]) => string }
)._resolveFilename = function (request: unknown, ...rest: unknown[]) {
  if (request === "server-only") return require.resolve("./_noop-server-only.cjs");
  return origResolve.call(this, request, ...rest);
};

async function main() {
  const { ensureFinAiTables } = await import("@/lib/fin-ai/db-bootstrap");
  const { rawSql } = await import("@/lib/db");

  await ensureFinAiTables();

  const tables = await rawSql`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_name LIKE 'fin_ai%'
     ORDER BY table_name`;
  console.log("tables:", tables);

  const cols = await rawSql`
    SELECT table_name, column_name, data_type
      FROM information_schema.columns
     WHERE table_name LIKE 'fin_ai%'
     ORDER BY table_name, ordinal_position`;
  console.table(cols);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
