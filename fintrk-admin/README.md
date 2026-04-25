# FinTRK Admin

Internal administration console for FinTRK.

- **Port:** `3005` (so the user app at `3004` and admin can run side-by-side).
- **Domain (prod):** `https://admin.fintrk.io`
- **Domain (local):** `https://local.admin.fintrk.io:3005`
- **Auth:** Clerk; only emails in `ADMIN_EMAILS` (in `.env.local`) can sign in.
- **DB:** Same Neon DB as the user app — read/write via `@neondatabase/serverless`.

## Run

```bash
cd fintrk-admin
npm install
npm run dev
```

Then open `http://localhost:3005`. Sign in with a Clerk user whose primary email is in `ADMIN_EMAILS`. Non-admins are bounced to `/login?denied=1`.

## Sections

- **Overview** – KPIs, growth, currency mix, behavior pulse.
- **Users** – list + per-user behavior dossier (transactions, statements, recurring, AI cost, currency mix, top merchants).
- **Tables** – auto-introspected list of every public table; click to view, edit, insert, delete rows.
- **Errors** – live error monitor (statement processing failures, file upload outcomes, ai_error log, optional `error_logs` table).
