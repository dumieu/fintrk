-- FinTRK admin ops tables (apply on Neon shared with user app)
-- Safe to re-run (IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS cron_runs (
  cron_path text PRIMARY KEY,
  last_success_at timestamptz NOT NULL,
  duration_ms integer,
  summary jsonb,
  last_failure_at timestamptz,
  failure_duration_ms integer,
  failure_summary jsonb
);

CREATE TABLE IF NOT EXISTS error_logs (
  id text PRIMARY KEY,
  clerk_user_id text,
  error_context text NOT NULL,
  error_message text NOT NULL,
  error_code text,
  severity text NOT NULL DEFAULT 'error',
  pathname text,
  ip_address text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_comment text
);
CREATE INDEX IF NOT EXISTS error_logs_created_at_idx ON error_logs (created_at);
CREATE INDEX IF NOT EXISTS error_logs_user_idx ON error_logs (clerk_user_id);
CREATE INDEX IF NOT EXISTS error_logs_context_idx ON error_logs (error_context);
CREATE INDEX IF NOT EXISTS error_logs_severity_idx ON error_logs (severity);

CREATE TABLE IF NOT EXISTS feedback_submissions (
  id text PRIMARY KEY,
  clerk_user_id text,
  email text NOT NULL,
  sentiment text NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_submissions_created_at_idx ON feedback_submissions (created_at);
CREATE INDEX IF NOT EXISTS feedback_submissions_sentiment_idx ON feedback_submissions (sentiment);

CREATE TABLE IF NOT EXISTS contact_submissions (
  id text PRIMARY KEY,
  clerk_user_id text,
  full_name text NOT NULL,
  email text NOT NULL,
  country text NOT NULL DEFAULT '',
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_submissions_created_at_idx ON contact_submissions (created_at);

CREATE TABLE IF NOT EXISTS admin_audit_buffer (
  id text PRIMARY KEY,
  admin_identifier text NOT NULL,
  action text NOT NULL,
  resource text NOT NULL,
  detail jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_buffer_created_at_idx ON admin_audit_buffer (created_at);

CREATE TABLE IF NOT EXISTS admin_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Matches MktgTRK/lib/fintrk/decryption-session.ts
CREATE TABLE IF NOT EXISTS admin_decryption_sessions (
  id              SERIAL PRIMARY KEY,
  admin_email     TEXT NOT NULL,
  admin_user_id   TEXT,
  reason          TEXT NOT NULL,
  tables_accessed TEXT[] NOT NULL DEFAULT '{}',
  access_count    INTEGER NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked         BOOLEAN NOT NULL DEFAULT false,
  revoked_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS admin_decrypt_sessions_active_idx
  ON admin_decryption_sessions (expires_at)
  WHERE revoked = false;
