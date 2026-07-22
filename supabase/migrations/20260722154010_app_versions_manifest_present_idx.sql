-- Permanent partial index for hourly dual-storage reclaim candidate discovery.
-- Migrations cannot use CREATE INDEX CONCURRENTLY (transactional).
-- On large prod DBs, optionally prebuild with scripts/ops/reclaim_supabase_swap_index.sql
-- so this IF NOT EXISTS is a no-op and avoids a write-blocking build.
CREATE INDEX IF NOT EXISTS app_versions_manifest_present_idx
  ON public.app_versions USING btree (id)
  WHERE manifest IS NOT NULL;
