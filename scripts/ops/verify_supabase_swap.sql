-- Post-deploy / post-reclaim verification for Capgo-EU swap pressure.
-- Prefer psql. Avoids unbounded whole-table counts where possible.

SELECT pg_size_pretty(pg_database_size(current_database())::bigint) AS db_size;

SELECT name, setting
FROM pg_settings
WHERE name IN ('shared_buffers', 'work_mem', 'max_connections');

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

-- Sample of dual-storage leftovers that are eligible for nulling (bounded).
SELECT count(*) AS eligible_dual_storage_sample
FROM (
  SELECT av.id
  FROM public.app_versions AS av
  WHERE av.manifest IS NOT NULL
    AND cardinality(av.manifest) > 0
    AND (
      SELECT count(*)::integer
      FROM public.manifest AS m
      WHERE m.app_version_id = av.id
    ) >= GREATEST(COALESCE(av.manifest_count, 0), cardinality(av.manifest))
  ORDER BY av.id
  LIMIT 1000
) AS sample;

SELECT name, enabled, hour_interval, run_at_hour, run_at_minute, target
FROM public.cron_tasks
WHERE name IN (
  'cleanup_queue_messages',
  'cleanup_net_http_response',
  'cleanup_old_audit_logs',
  'null_migrated_app_version_manifests'
)
ORDER BY name;

SELECT status, return_message, count(*) AS n
FROM cron.job_run_details
WHERE start_time > now() - interval '24 hours'
   OR (start_time IS NULL AND status IN ('failed', 'connecting'))
GROUP BY status, return_message
ORDER BY n DESC
LIMIT 20;

-- Bounded existence checks per archive queue (no full-table aggregates).
SELECT queue_name, has_rows_older_than_2d
FROM (
  SELECT 'a_on_manifest_create' AS queue_name,
         EXISTS (
           SELECT 1
           FROM pgmq.a_on_manifest_create
           WHERE archived_at < now() - interval '2 days'
           LIMIT 1
         ) AS has_rows_older_than_2d
  UNION ALL
  SELECT 'a_on_version_update',
         EXISTS (
           SELECT 1
           FROM pgmq.a_on_version_update
           WHERE archived_at < now() - interval '2 days'
           LIMIT 1
         )
  UNION ALL
  SELECT 'a_webhook_dispatcher',
         EXISTS (
           SELECT 1
           FROM pgmq.a_webhook_dispatcher
           WHERE archived_at < now() - interval '2 days'
           LIMIT 1
         )
  UNION ALL
  SELECT 'a_on_channel_update',
         EXISTS (
           SELECT 1
           FROM pgmq.a_on_channel_update
           WHERE archived_at < now() - interval '2 days'
           LIMIT 1
         )
) AS archives
ORDER BY queue_name;

SELECT
  'index hit rate' AS name,
  ROUND((sum(idx_blks_hit) / nullif(sum(idx_blks_hit + idx_blks_read), 0) * 100)::numeric, 2) AS ratio
FROM pg_statio_user_indexes
UNION ALL
SELECT
  'table hit rate',
  ROUND((sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100)::numeric, 2)
FROM pg_statio_user_tables;
