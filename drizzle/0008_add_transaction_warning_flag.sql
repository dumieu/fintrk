ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS warning_flag boolean DEFAULT false NOT NULL;
