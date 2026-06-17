/**
 * Idempotent migration for FinTRK field-level encryption.
 *
 * Encrypted values are base64 ciphertext, so a few columns that previously
 * stored numbers must become text. This converts them in place, preserving
 * existing data (which stays plaintext and decrypts via passthrough until the
 * next write re-encrypts it).
 *
 *   npx tsx scripts/migrate-encrypt-columns.ts
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = neon(url);

  const types = (await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'net_worth_settings'
      AND column_name IN ('annual_income', 'birth_month', 'birth_year')
  `) as Array<{ column_name: string; data_type: string }>;
  const typeOf = (col: string) => types.find((t) => t.column_name === col)?.data_type ?? null;

  if (typeOf("annual_income") && typeOf("annual_income") !== "text") {
    console.log(`→ net_worth_settings.annual_income: ${typeOf("annual_income")} -> text`);
    await sql`ALTER TABLE net_worth_settings ALTER COLUMN annual_income DROP DEFAULT`;
    await sql`ALTER TABLE net_worth_settings ALTER COLUMN annual_income DROP NOT NULL`;
    await sql`ALTER TABLE net_worth_settings ALTER COLUMN annual_income TYPE text USING annual_income::text`;
  } else {
    console.log("✓ net_worth_settings.annual_income already text");
  }

  if (typeOf("birth_month") && typeOf("birth_month") !== "text") {
    console.log(`→ net_worth_settings.birth_month: ${typeOf("birth_month")} -> text`);
    await sql`ALTER TABLE net_worth_settings ALTER COLUMN birth_month TYPE text USING birth_month::text`;
  } else {
    console.log("✓ net_worth_settings.birth_month already text");
  }

  if (typeOf("birth_year") && typeOf("birth_year") !== "text") {
    console.log(`→ net_worth_settings.birth_year: ${typeOf("birth_year")} -> text`);
    await sql`ALTER TABLE net_worth_settings ALTER COLUMN birth_year TYPE text USING birth_year::text`;
  } else {
    console.log("✓ net_worth_settings.birth_year already text");
  }

  console.log("✓ encryption column migration complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
