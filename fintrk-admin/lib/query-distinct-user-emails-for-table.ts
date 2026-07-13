import "server-only";

import { sql } from "@/lib/db";
import {
  CLERK_USER_ID_EMAIL_TABLES,
  type UserEmailFilterTable,
} from "@/lib/user-email-filter-tables";

export async function queryDistinctUserEmailsForTable(
  table: UserEmailFilterTable,
): Promise<{ email: string; clerk_user_id: string }[]> {
  if (CLERK_USER_ID_EMAIL_TABLES.has(table) || table === "users") {
    const rows = await sql.query(
      `SELECT DISTINCT
         clerk_user_id,
         COALESCE(
           NULLIF(TRIM(primary_email), ''),
           NULLIF(TRIM(clerk_user_id), ''),
           'n/a'
         ) AS email
       FROM users
       WHERE clerk_user_id IS NOT NULL AND TRIM(clerk_user_id) <> ''
       ORDER BY email ASC`,
      [],
    );
    return rows.map((r: { clerk_user_id?: unknown; email?: unknown }) => ({
      email: String(r.email ?? ""),
      clerk_user_id: String(r.clerk_user_id ?? ""),
    }));
  }

  const rows = await sql.query(
    `SELECT DISTINCT
       t.user_id AS clerk_user_id,
       COALESCE(
         NULLIF(TRIM(u.primary_email), ''),
         NULLIF(TRIM(t.user_id), ''),
         'n/a'
       ) AS email
     FROM "${table}" t
     LEFT JOIN users u ON u.clerk_user_id = t.user_id
     WHERE t.user_id IS NOT NULL AND TRIM(t.user_id) <> ''
     ORDER BY email ASC`,
    [],
  );
  return rows.map((r: { clerk_user_id?: unknown; email?: unknown }) => ({
    email: String(r.email ?? ""),
    clerk_user_id: String(r.clerk_user_id ?? ""),
  }));
}
