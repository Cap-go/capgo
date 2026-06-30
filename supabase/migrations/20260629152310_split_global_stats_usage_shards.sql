UPDATE public.global_stats
SET completed_shards = (
  SELECT COALESCE(jsonb_agg(marker ORDER BY marker), '[]'::jsonb)
  FROM (
    SELECT DISTINCT marker
    FROM (
      SELECT marker
      FROM jsonb_array_elements_text(
        COALESCE(public.global_stats.completed_shards, '[]'::jsonb)
      ) AS existing_markers(marker)
      WHERE marker <> 'usage'

      UNION ALL
      SELECT 'usage_updates'

      UNION ALL
      SELECT 'usage_devices'

      UNION ALL
      SELECT 'usage_device_platforms'

      UNION ALL
      SELECT 'usage_registrations'

      UNION ALL
      SELECT 'usage_storage'

      UNION ALL
      SELECT 'usage_success_rate'

      UNION ALL
      SELECT 'usage_demo_apps'
    ) markers
  ) deduped
)
WHERE COALESCE(completed_shards, '[]'::jsonb) ? 'usage';
