-- Expand feedback_submissions for FinTRK feedback form (name, app, idea questions)
ALTER TABLE feedback_submissions
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS app_name text,
  ADD COLUMN IF NOT EXISTS idea_redesign_screen text,
  ADD COLUMN IF NOT EXISTS idea_other_tools text,
  ADD COLUMN IF NOT EXISTS idea_spreadsheet_tracking text,
  ADD COLUMN IF NOT EXISTS idea_first_feature text,
  ADD COLUMN IF NOT EXISTS idea_friend_description text,
  ADD COLUMN IF NOT EXISTS idea_miss_most text;
