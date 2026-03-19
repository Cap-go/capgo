ALTER TABLE public.global_stats
ADD COLUMN build_minutes_day_ios double precision DEFAULT 0 NOT NULL,
ADD COLUMN build_minutes_day_android double precision DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.global_stats.build_minutes_day_ios IS 'Total iOS build minutes recorded for the day';
COMMENT ON COLUMN public.global_stats.build_minutes_day_android IS 'Total Android build minutes recorded for the day';

WITH daily_build_minutes AS (
  SELECT
    ((created_at AT TIME ZONE 'UTC')::date)::text AS date_id,
    COALESCE(SUM(CASE WHEN platform = 'ios' THEN build_time_unit ELSE 0 END), 0) / 60.0 AS ios_minutes,
    COALESCE(SUM(CASE WHEN platform = 'android' THEN build_time_unit ELSE 0 END), 0) / 60.0 AS android_minutes
  FROM public.build_logs
  GROUP BY 1
)
UPDATE public.global_stats AS gs
SET
  build_minutes_day_ios = daily_build_minutes.ios_minutes,
  build_minutes_day_android = daily_build_minutes.android_minutes
FROM daily_build_minutes
WHERE gs.date_id = daily_build_minutes.date_id;
