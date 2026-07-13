-- Waterproof transaction dedupe for mid-month statement re-uploads.
-- 1) dedupe_signature: normalized date|amount|description (or ref:<strong-id>)
-- 2) occurrence_index: keeps N identical same-day lines (Starbucks x2)
-- NOTE: Do NOT unique-index reference_id alone — historical AI extracts often
-- reused card numbers / short codes across hundreds of distinct transactions.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS occurrence_index integer NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS dedupe_signature text;

UPDATE transactions
SET dedupe_signature =
  posted_date::text
  || '|'
  || trim(to_char(base_amount, 'FM999999999999990.0000'))
  || '|'
  || lower(trim(regexp_replace(raw_description, E'\\s+', ' ', 'g')))
WHERE dedupe_signature IS NULL OR btrim(dedupe_signature) = '';

-- Disambiguate rows that collide after normalization (preserves all existing rows)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY account_id, dedupe_signature
      ORDER BY created_at ASC, id ASC
    ) - 1 AS occ
  FROM transactions
)
UPDATE transactions t
SET occurrence_index = ranked.occ
FROM ranked
WHERE t.id = ranked.id;

ALTER TABLE transactions ALTER COLUMN dedupe_signature SET NOT NULL;

DROP INDEX IF EXISTS txn_dedup_idx;
CREATE UNIQUE INDEX txn_dedup_idx
  ON transactions (account_id, dedupe_signature, occurrence_index);

DROP INDEX IF EXISTS txn_ref_dedup_idx;
