-- Capgo-EU Phase A reclaim (run manually in a maintenance window).
-- Prefer psql (VACUUM cannot run inside a transaction / SQL-editor DO block).
-- Example:
--   PGPASSWORD=... psql "postgresql://..." -v ON_ERROR_STOP=1 -f scripts/ops/reclaim_supabase_swap.sql
-- Safe order: truncate empty bloat -> batched archive deletes -> null dual manifests -> trim audit.
-- Each batch commits (separate statements). Re-run until notices show 0 deleted/updated.

-- ---------------------------------------------------------------------------
-- 0) Baseline sizes
-- ---------------------------------------------------------------------------
SELECT pg_size_pretty(pg_database_size(current_database())::bigint) AS db_size;

SELECT
  relname,
  n_live_tup,
  pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass)::bigint) AS total
FROM pg_stat_user_tables
WHERE (schemaname, relname) IN (
  ('net', '_http_response'),
  ('public', 'audit_logs'),
  ('public', 'app_versions'),
  ('public', 'manifest'),
  ('pgmq', 'a_on_version_update'),
  ('pgmq', 'a_on_manifest_create'),
  ('pgmq', 'a_webhook_dispatcher'),
  ('pgmq', 'a_on_channel_update')
)
ORDER BY pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass) DESC;

-- ---------------------------------------------------------------------------
-- 1) Truncate pg_net response bloat
-- ---------------------------------------------------------------------------
TRUNCATE TABLE net._http_response;

-- ---------------------------------------------------------------------------
-- 2) Purge pgmq archives older than 2 days (one committed batch per statement).
--    Re-run this section until deleted totals are 0.
-- ---------------------------------------------------------------------------
SELECT public.cleanup_queue_messages();

VACUUM (VERBOSE) pgmq.a_on_version_update;
VACUUM (VERBOSE) pgmq.a_on_manifest_create;
VACUUM (VERBOSE) pgmq.a_webhook_dispatcher;
VACUUM (VERBOSE) pgmq.a_on_channel_update;

-- Optional hard reclaim if VACUUM leaves empty pages (stronger locks):
-- VACUUM (FULL, VERBOSE) pgmq.a_on_version_update;
-- VACUUM (FULL, VERBOSE) pgmq.a_on_manifest_create;
-- VACUUM (FULL, VERBOSE) pgmq.a_webhook_dispatcher;
-- VACUUM (FULL, VERBOSE) pgmq.a_on_channel_update;

-- ---------------------------------------------------------------------------
-- 3) Null fully migrated app_versions.manifest arrays
--    Requires every expected legacy entry to exist in public.manifest.
--    Re-run until notice shows 0.
-- ---------------------------------------------------------------------------
SELECT public.null_migrated_app_version_manifests();

VACUUM (VERBOSE) public.app_versions;

-- ---------------------------------------------------------------------------
-- 4) Trim audit_logs older than 30 days (bounded batches). Re-run until 0.
-- ---------------------------------------------------------------------------
SELECT public.cleanup_old_audit_logs();

VACUUM (VERBOSE) public.audit_logs;

-- ---------------------------------------------------------------------------
-- 5) Final sizes
-- ---------------------------------------------------------------------------
SELECT pg_size_pretty(pg_database_size(current_database())::bigint) AS db_size_after;

SELECT
  relname,
  n_live_tup,
  pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass)::bigint) AS total
FROM pg_stat_user_tables
WHERE (schemaname, relname) IN (
  ('net', '_http_response'),
  ('public', 'audit_logs'),
  ('public', 'app_versions'),
  ('public', 'manifest'),
  ('pgmq', 'a_on_version_update'),
  ('pgmq', 'a_on_manifest_create'),
  ('pgmq', 'a_webhook_dispatcher'),
  ('pgmq', 'a_on_channel_update')
)
ORDER BY pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass) DESC;
