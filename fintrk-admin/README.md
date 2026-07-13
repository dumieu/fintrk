# FinTRK Admin

Ops console for FinTRK (household finance). Port **3005**. Shares the FinTRK Neon database and uses a break-the-glass decryption session for encrypted PII.

## Run

```bash
cd FinTRK/fintrk-admin
npm install
cp .env.example .env.local   # fill values
npm run dev                  # http://localhost:3005
# or HTTPS local:
npm run dev:local            # https://local.admin.fintrk.io:3005
```

## Modules

| Route | Purpose |
|-------|---------|
| `/overview` | Platform KPIs, sparklines, ingest pulse |
| `/users` | User directory, 30d charts, Pro grant/revoke, hard delete |
| `/users/[id]` | Behavior dossier + plan badge |
| `/users/messages` | Feedback + contact submissions |
| `/data` | Neon table catalog (size, rows, columns) |
| `/tables/[table]` | Spreadsheet DataTable CRUD |
| `/crons` | FinTRK cron registry + test trigger |
| `/errors` | Error monitor |
| `/security` | Decryption UX, audit, secrets presence, vendors, DRP |

## Env vars

See `.env.example`. Required for core ops:

- `DATABASE_URL` - Neon connection (same as user app)
- `ADMIN_EMAILS` - comma-separated allow-list
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` - admin Clerk
- `FINTRK_ENCRYPTION_KEY` - must match user app (min 32 chars)

Optional:

- `USER_APP_CLERK_SECRET_KEY` - user-app Clerk for plan metadata + hard delete
- `USER_APP_URL` + `CRON_SECRET` - cron test triggers
- Stripe / Google / Vercel keys - shown on Security → Secrets (presence only)

## Auth

All APIs use `requireAdmin()` (`lib/auth-admin.ts`). Decryption sessions live in `lib/decryption-session.ts` and the top banner (`DecryptionSessionBanner`).
