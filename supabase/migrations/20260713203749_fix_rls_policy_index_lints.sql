-- Keep the optimized policies introduced by the unfiltered-read timeout fix.
-- These legacy policies cover the same SELECT roles and force PostgreSQL to
-- evaluate a second permissive expression for every read.
DROP POLICY IF EXISTS "Allow read for auth (read+)"
ON "public"."channel_devices";

DROP POLICY IF EXISTS "Allow org admins to select sso_providers"
ON "public"."sso_providers";

-- The idx_manifest_* versions were added later for the same one-column
-- lookups. The older manifest_* indexes are fully redundant.
-- Supabase migrations run in a transaction, so this cannot use DROP INDEX CONCURRENTLY.
DROP INDEX IF EXISTS "public"."manifest_file_hash_idx";
DROP INDEX IF EXISTS "public"."manifest_file_name_idx";
