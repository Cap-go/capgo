-- Capgo-EU Phase A reclaim (run manually in a maintenance window).
-- Prefer psql (VACUUM cannot run inside a transaction / SQL-editor DO block).
-- Example:
--   PGPASSWORD=... psql "postgresql://..." -v ON_ERROR_STOP=1 -f scripts/ops/reclaim_supabase_swap.sql
-- Safe order: truncate empty bloat -> batched archive deletes -> null dual manifests -> trim audit.
-- Each statement commits separately. Re-run until cleanup notices report deleted/updated = 0
-- (functions always emit a notice, including zero totals).

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
-- 2) Purge pgmq archives/stuck messages (global batch budget per call).
--    Re-run this SELECT until the notice shows archived_deleted=0 and stuck_deleted=0.
-- ---------------------------------------------------------------------------
SELECT public.cleanup_queue_messages();

-- Vacuum every pgmq archive + queue table (psql \gexec; VACUUM cannot run in DO/tx).
SELECT format('VACUUM (VERBOSE) pgmq.a_%I;', queue_name)
FROM pgmq.list_queues()
\gexec
SELECT format('VACUUM (VERBOSE) pgmq.q_%I;', queue_name)
FROM pgmq.list_queues()
\gexec

-- Optional hard reclaim (stronger locks):
-- SELECT format('VACUUM (FULL, VERBOSE) pgmq.a_%I;', queue_name) FROM pgmq.list_queues() \gexec
-- SELECT format('VACUUM (FULL, VERBOSE) pgmq.q_%I;', queue_name) FROM pgmq.list_queues() \gexec

-- ---------------------------------------------------------------------------
-- 3) Null fully migrated app_versions.manifest arrays
--    Requires every expected legacy entry to exist in public.manifest.
--    Re-run until notice shows updated=0.
-- ---------------------------------------------------------------------------
SELECT public.null_migrated_app_version_manifests();

VACUUM (VERBOSE) public.app_versions;
-- Routine VACUUM does not shrink TOAST. After nulling is done, compact in the
-- maintenance window (exclusive lock):
-- VACUUM (FULL, VERBOSE) public.app_versions;

-- ---------------------------------------------------------------------------
-- 4) Trim audit_logs older than 30 days (bounded batches). Re-run until deleted=0.
-- ---------------------------------------------------------------------------
SELECT public.cleanup_old_audit_logs();

VACUUM (VERBOSE) public.audit_logs;
-- After deleted=0, compact TOAST if pg_total_relation_size must fall:
-- VACUUM (FULL, VERBOSE) public.audit_logs;

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
