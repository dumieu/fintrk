-- Durable, minimal-footprint statement file retention.
-- file_blob holds the original upload compressed (gzip) then encrypted
-- (AES-256-GCM) as raw bytea, so there is no base64 storage bloat.
-- stored_size is the packed byte length, for storage telemetry.
ALTER TABLE "statements" ADD COLUMN IF NOT EXISTS "file_blob" bytea;
ALTER TABLE "statements" ADD COLUMN IF NOT EXISTS "stored_size" integer;
