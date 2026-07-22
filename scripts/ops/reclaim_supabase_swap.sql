-- Capgo-EU Phase A reclaim (run manually in a maintenance window).
-- REQUIRED: psql for VACUUM (cannot run inside a transaction / SQL-editor tx).
-- Prefer ~/.pgpass / PGPASSFILE instead of putting the password on the CLI.
--
-- Schema source of truth: migration 20260722154010_app_versions_manifest_present_idx.
-- Optional non-blocking prebuild before that migration deploys:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/ops/reclaim_supabase_swap_index.sql
--
-- Example:
--   psql "postgresql://postgres@HOST:5432/postgres?sslmode=require" -v ON_ERROR_STOP=1 -f scripts/ops/reclaim_supabase_swap.sql
-- Safe order: truncate -> archives -> null manifests -> audit trim.
-- Re-run the FULL script until cleanup notices report deleted/updated = 0
-- (functions always emit a notice, including zero totals).

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 0) Baseline sizes + require a valid candidate index
-- ---------------------------------------------------------------------------
SELECT pg_size_pretty(pg_database_size(current_database())::bigint) AS db_size;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS idx
    JOIN pg_catalog.pg_namespace AS ns ON ns.oid = idx.relnamespace
    JOIN pg_catalog.pg_index AS i ON i.indexrelid = idx.oid
    WHERE ns.nspname = 'public'
      AND idx.relname = 'app_versions_manifest_present_idx'
      AND i.indrelid = 'public.app_versions'::pg_catalog.regclass
      AND i.indisvalid
  ) THEN
    RAISE EXCEPTION
      'Missing or invalid app_versions_manifest_present_idx. Deploy migration 20260722154010 (or run scripts/ops/reclaim_supabase_swap_index.sql alone first if the index is invalid/missing).';
  END IF;
END $$;

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
-- 2) Purge pgmq archives/stuck messages.
--    Re-run the FULL script until archived_deleted=0 and stuck_deleted=0.
-- ---------------------------------------------------------------------------
SELECT public.cleanup_queue_messages();

VACUUM (VERBOSE) pgmq.a_on_version_update;
VACUUM (VERBOSE) pgmq.a_on_manifest_create;
VACUUM (VERBOSE) pgmq.a_webhook_dispatcher;
VACUUM (VERBOSE) pgmq.a_on_channel_update;
VACUUM (VERBOSE) pgmq.q_on_version_update;
VACUUM (VERBOSE) pgmq.q_on_manifest_create;
VACUUM (VERBOSE) pgmq.q_webhook_dispatcher;
VACUUM (VERBOSE) pgmq.q_on_channel_update;

-- ---------------------------------------------------------------------------
-- 3) Null fully migrated app_versions.manifest arrays (s3_path + file_hash).
--    Re-run the FULL script until updated=0.
-- ---------------------------------------------------------------------------
SELECT public.null_migrated_app_version_manifests();

VACUUM (ANALYZE, VERBOSE) public.app_versions;
-- Optional TOAST compaction after updated=0:
-- VACUUM (FULL, VERBOSE) public.app_versions;

-- ---------------------------------------------------------------------------
-- 4) Trim audit_logs older than 30 days.
--    Re-run the FULL script until deleted=0.
-- ---------------------------------------------------------------------------
SELECT public.cleanup_old_audit_logs();

VACUUM (ANALYZE, VERBOSE) public.audit_logs;
-- Optional TOAST compaction after deleted=0:
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
