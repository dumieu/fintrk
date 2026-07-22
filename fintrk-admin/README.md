# FinTRK Admin — MOVED (redirect stub only)

**Canonical location:** xTRK Admin (`MktgTRK/`) → sidebar **Admin → FinTRK**

| | |
|--|--|
| UI | `https://admin.xtrk.ai/admin/fintrk` |
| Local | `https://local.admin.xtrk.ai:3002/admin/fintrk` |
| Source | `MktgTRK/app/admin/fintrk`, `MktgTRK/app/api/admin/fintrk`, `MktgTRK/components/fintrk`, `MktgTRK/lib/fintrk` |
| Rule | `MktgTRK/.cursor/rules/fintrk-admin.mdc` |

This folder is a **redirect-only** package for legacy `admin.fintrk.io` / port 3005 bookmarks. Do not add product features here.

```bash
cd MktgTRK && npm run dev
# open Admin → FinTRK
```

Env for FinTRK ops lives on xTRK Admin: `FINTRK_DATABASE_URL`, Clerk keys, `ADMIN_EMAILS`, `FINTRK_ENCRYPTION_KEY` (see `MktgTRK/.env.example`).
