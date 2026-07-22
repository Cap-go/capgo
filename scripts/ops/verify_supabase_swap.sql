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

-- Bound candidate discovery first, then evaluate eligibility inside the sample.
SELECT count(*) AS eligible_dual_storage_sample
FROM (
  SELECT sample.id
  FROM (
    SELECT av.id, av.manifest, av.manifest_count
    FROM public.app_versions AS av
    WHERE av.manifest IS NOT NULL
    ORDER BY av.id
    LIMIT 1000
  ) AS sample
  WHERE cardinality(sample.manifest) > 0
    AND (
      SELECT count(*)::integer
      FROM public.manifest AS m
      WHERE m.app_version_id = sample.id
    ) >= (
      CASE
        WHEN COALESCE(sample.manifest_count, 0) >= cardinality(sample.manifest)
          THEN COALESCE(sample.manifest_count, 0)
        ELSE cardinality(sample.manifest)
      END
    )
) AS eligible;

SELECT name, enabled, hour_interval, run_at_hour, run_at_minute, target, updated_at
FROM public.cron_tasks
WHERE name IN (
  'cleanup_queue_messages',
  'cleanup_net_http_response',
  'cleanup_old_audit_logs',
  'null_migrated_app_version_manifests'
)
ORDER BY name;

-- process_all_cron_tasks() swallows per-task errors; cron.job_run_details only
-- reflects the outer job. Prefer Postgres logs / healthchecks for task failures.
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname = 'app_versions_manifest_present_idx';

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
