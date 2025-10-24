-- Add daily registrations and bundle storage metrics to global_stats
ALTER TABLE public.global_stats
ADD COLUMN registers_today bigint DEFAULT 0 NOT NULL;

ALTER TABLE public.global_stats
ADD COLUMN bundle_storage_gb double precision DEFAULT 0 NOT NULL;

-- Helper function to compute total bundle storage in bytes
CREATE OR REPLACE FUNCTION public.total_bundle_storage_bytes() RETURNS bigint LANGUAGE sql SECURITY DEFINER
SET
search_path = '' AS $$
  SELECT COALESCE(SUM(size), 0)::bigint
  FROM public.app_versions_meta;
$$;

REVOKE ALL ON FUNCTION public.total_bundle_storage_bytes()
FROM
public;

GRANT
EXECUTE ON FUNCTION public.total_bundle_storage_bytes() TO service_role;

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
