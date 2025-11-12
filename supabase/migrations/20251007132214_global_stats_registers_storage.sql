-- Add daily registrations and bundle storage metrics to global_stats
ALTER TABLE public.global_stats
ADD COLUMN registers_today bigint DEFAULT 0 NOT NULL;

ALTER TABLE public.global_stats
ADD COLUMN bundle_storage_gb double precision DEFAULT 0 NOT NULL;

-- Helper function to compute total bundle storage in bytes
CREATE OR REPLACE FUNCTION public.total_bundle_storage_bytes () RETURNS bigint LANGUAGE sql SECURITY DEFINER
SET
    search_path = '' AS $$
  SELECT (
    -- Sum of bundle sizes from app_versions_meta
    COALESCE(
      (SELECT SUM(size) FROM public.app_versions_meta),
      0
    ) +
    -- Sum of manifest file sizes for non-deleted versions
    COALESCE(
      (SELECT SUM(m.file_size)
       FROM public.manifest m
       WHERE EXISTS (
         SELECT 1
         FROM public.app_versions av
         WHERE av.id = m.app_version_id
         AND av.deleted = false
       )),
      0
    )
  )::bigint;
$$;

REVOKE ALL ON FUNCTION public.total_bundle_storage_bytes ()
FROM
    public;

GRANT
EXECUTE ON FUNCTION public.total_bundle_storage_bytes () TO service_role;

-- Backfill registers_today using historical user signup data
WITH
    user_counts AS (
        SELECT
            TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date_id,
            COUNT(*)::bigint AS register_count
        FROM
            public.users
        WHERE
            created_at IS NOT NULL
        GROUP BY
            1
    )
UPDATE public.global_stats AS gs
SET
    registers_today = uc.register_count
FROM
    user_counts AS uc
WHERE
    gs.date_id = uc.date_id;
