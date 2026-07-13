-- Global per-user scratch pad (Quick Note)
CREATE TABLE IF NOT EXISTS user_quick_notes (
  id TEXT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_quick_notes_user_id_uniq
  ON user_quick_notes (user_id);

CREATE INDEX IF NOT EXISTS user_quick_notes_user_id_idx
  ON user_quick_notes (user_id);
