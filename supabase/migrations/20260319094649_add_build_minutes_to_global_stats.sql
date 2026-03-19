ALTER TABLE public.global_stats
ADD COLUMN build_minutes_day_ios double precision DEFAULT 0 NOT NULL,
ADD COLUMN build_minutes_day_android double precision DEFAULT 0 NOT NULL;
ALTER TABLE public.global_stats
ADD COLUMN builds_day_ios bigint DEFAULT 0 NOT NULL,
ADD COLUMN builds_day_android bigint DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.global_stats.build_minutes_day_ios IS 'Total iOS build minutes recorded for the day';
COMMENT ON COLUMN public.global_stats.build_minutes_day_android IS 'Total Android build minutes recorded for the day';
COMMENT ON COLUMN public.global_stats.builds_day_ios IS 'Total iOS builds recorded for the day';
COMMENT ON COLUMN public.global_stats.builds_day_android IS 'Total Android builds recorded for the day';

WITH daily_build_metrics AS (
  SELECT
    ((created_at AT TIME ZONE 'UTC')::date)::text AS date_id,
    COALESCE(SUM(CASE WHEN platform = 'ios' THEN build_time_unit ELSE 0 END), 0) / 60.0 AS ios_minutes,
    COALESCE(SUM(CASE WHEN platform = 'android' THEN build_time_unit ELSE 0 END), 0) / 60.0 AS android_minutes,
    COALESCE(SUM(CASE WHEN platform = 'ios' THEN 1 ELSE 0 END), 0) AS ios_builds,
    COALESCE(SUM(CASE WHEN platform = 'android' THEN 1 ELSE 0 END), 0) AS android_builds
  FROM public.build_logs
  GROUP BY 1
)
UPDATE public.global_stats AS gs
SET
  build_minutes_day_ios = daily_build_metrics.ios_minutes,
  build_minutes_day_android = daily_build_metrics.android_minutes,
  builds_day_ios = daily_build_metrics.ios_builds,
  builds_day_android = daily_build_metrics.android_builds
FROM daily_build_metrics
WHERE gs.date_id = daily_build_metrics.date_id;

CREATE INDEX IF NOT EXISTS build_logs_created_at_idx ON public.build_logs (created_at);
CREATE INDEX IF NOT EXISTS build_logs_platform_created_at_idx ON public.build_logs (platform, created_at);
