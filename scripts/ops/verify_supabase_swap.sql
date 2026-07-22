-- Post-deploy / post-reclaim verification for Capgo-EU swap pressure.

SELECT pg_size_pretty(pg_database_size(current_database())::bigint) AS db_size;

SELECT
  name,
  setting
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

SELECT count(*) AS versions_with_array_manifest
FROM public.app_versions
WHERE manifest IS NOT NULL AND cardinality(manifest) > 0;

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

SELECT
  count(*) FILTER (WHERE archived_at < now() - interval '2 days') AS archives_older_than_2d,
  count(*) AS archives_total
FROM pgmq.a_on_manifest_create;

SELECT
  'index hit rate' AS name,
  ROUND((sum(idx_blks_hit) / nullif(sum(idx_blks_hit + idx_blks_read), 0) * 100)::numeric, 2) AS ratio
FROM pg_statio_user_indexes
UNION ALL
SELECT
  'table hit rate',
  ROUND((sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100)::numeric, 2)
FROM pg_statio_user_tables;
