-- Optional Capgo-EU pre-deploy: build the candidate index without blocking writes.
-- Run this ALONE (one statement) before applying migration
-- 20260722154010_app_versions_manifest_present_idx so the migration's
-- CREATE INDEX IF NOT EXISTS becomes a no-op.
--
-- REQUIRED: psql (CREATE INDEX CONCURRENTLY cannot run inside a transaction).
-- SQL Editor: paste ONLY the CREATE INDEX statement below.
--
-- Example:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/ops/reclaim_supabase_swap_index.sql

CREATE INDEX CONCURRENTLY IF NOT EXISTS app_versions_manifest_present_idx
  ON public.app_versions USING btree (id)
  WHERE manifest IS NOT NULL;
