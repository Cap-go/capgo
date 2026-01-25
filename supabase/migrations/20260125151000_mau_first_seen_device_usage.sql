-- Update read_device_usage to count unique devices once per period (first seen in range)
-- This aligns MAU with "unique over period" semantics rather than per-day DAU.
CREATE OR REPLACE FUNCTION "public"."read_device_usage" (
  "p_app_id" pg_catalog.varchar,
  "p_period_start" pg_catalog.timestamp,
  "p_period_end" pg_catalog.timestamp
) RETURNS TABLE (
  "date" pg_catalog.date,
  "mau" pg_catalog.int8,
  "app_id" pg_catalog.varchar
) LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT
    first_seen.date AS date,
    COUNT(*)::bigint AS mau,
    p_app_id AS app_id
  FROM (
    SELECT
      MIN(DATE_TRUNC('day', device_usage.timestamp)::date) AS date,
      device_usage.device_id
    FROM public.device_usage
    WHERE
      device_usage.app_id = p_app_id
      AND device_usage.timestamp >= p_period_start
      AND device_usage.timestamp < p_period_end
    GROUP BY device_usage.device_id
  ) AS first_seen
  GROUP BY first_seen.date
  ORDER BY first_seen.date;
END;
$$;
