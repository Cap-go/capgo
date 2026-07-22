-- Capgo-EU Phase A reclaim (run manually in a maintenance window).
-- Safe order: truncate empty bloat -> batched archive deletes -> null dual manifests -> trim audit.
-- Do NOT wrap the whole file in one transaction. VACUUM cannot run inside a transaction block.
-- Prefer Supabase SQL editor / psql as postgres. Re-run sections until counts hit zero.

\timing on
\set ON_ERROR_STOP on

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
-- 1) Truncate pg_net response bloat (~5GB empty table in prod)
-- ---------------------------------------------------------------------------
TRUNCATE TABLE net._http_response;

-- ---------------------------------------------------------------------------
-- 2) Purge pgmq archives older than 2 days (batched). Repeat until deleted=0.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  queue_name text;
  cutoff timestamptz := now() - interval '2 days';
  batch_size integer := 10000;
  deleted_batch integer;
  deleted_total bigint;
BEGIN
  FOREACH queue_name IN ARRAY ARRAY[
    'on_version_update',
    'on_manifest_create',
    'webhook_dispatcher',
    'on_channel_update'
  ]
  LOOP
    deleted_total := 0;
    LOOP
      EXECUTE format(
        'WITH doomed AS (
           SELECT ctid FROM pgmq.a_%I WHERE archived_at < $1 LIMIT $2
         )
         DELETE FROM pgmq.a_%I AS archive
         USING doomed
         WHERE archive.ctid = doomed.ctid',
        queue_name, queue_name
      ) USING cutoff, batch_size;
      GET DIAGNOSTICS deleted_batch = ROW_COUNT;
      deleted_total := deleted_total + deleted_batch;
      EXIT WHEN deleted_batch = 0;
    END LOOP;
    RAISE NOTICE 'purged % rows from pgmq.a_%', deleted_total, queue_name;
  END LOOP;
END $$;

VACUUM (VERBOSE) pgmq.a_on_version_update;
VACUUM (VERBOSE) pgmq.a_on_manifest_create;
VACUUM (VERBOSE) pgmq.a_webhook_dispatcher;
VACUUM (VERBOSE) pgmq.a_on_channel_update;

-- Optional hard reclaim if VACUUM leaves a lot of empty pages (takes stronger locks):
-- VACUUM (FULL, VERBOSE) pgmq.a_on_version_update;
-- VACUUM (FULL, VERBOSE) pgmq.a_on_manifest_create;
-- VACUUM (FULL, VERBOSE) pgmq.a_webhook_dispatcher;
-- VACUUM (FULL, VERBOSE) pgmq.a_on_channel_update;

-- ---------------------------------------------------------------------------
-- 3) Null migrated app_versions.manifest arrays (dual storage leftovers)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  batch_size integer := 200;
  updated_batch integer;
  updated_total bigint := 0;
BEGIN
  LOOP
    WITH doomed AS (
      SELECT av.id
      FROM public.app_versions AS av
      WHERE av.manifest IS NOT NULL
        AND cardinality(av.manifest) > 0
        AND EXISTS (
          SELECT 1 FROM public.manifest AS m WHERE m.app_version_id = av.id
        )
      ORDER BY av.id
      LIMIT batch_size
    )
    UPDATE public.app_versions AS av
    SET manifest = NULL
    FROM doomed
    WHERE av.id = doomed.id;
    GET DIAGNOSTICS updated_batch = ROW_COUNT;
    updated_total := updated_total + updated_batch;
    EXIT WHEN updated_batch = 0;
  END LOOP;
  RAISE NOTICE 'nulled manifest arrays on % versions', updated_total;
END $$;

VACUUM (VERBOSE) public.app_versions;

-- ---------------------------------------------------------------------------
-- 4) Trim audit_logs older than 30 days (batched)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  cutoff timestamptz := now() - interval '30 days';
  batch_size integer := 5000;
  deleted_batch integer;
  deleted_total bigint := 0;
BEGIN
  LOOP
    WITH doomed AS (
      SELECT ctid
      FROM public.audit_logs
      WHERE created_at < cutoff
      LIMIT batch_size
    )
    DELETE FROM public.audit_logs AS audit_logs
    USING doomed
    WHERE audit_logs.ctid = doomed.ctid;
    GET DIAGNOSTICS deleted_batch = ROW_COUNT;
    deleted_total := deleted_total + deleted_batch;
    EXIT WHEN deleted_batch = 0;
  END LOOP;
  RAISE NOTICE 'deleted % audit_logs rows older than 30 days', deleted_total;
END $$;

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
