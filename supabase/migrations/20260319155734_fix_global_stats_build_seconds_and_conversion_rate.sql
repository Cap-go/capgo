ALTER TABLE public.global_stats
RENAME COLUMN build_minutes_day_ios TO build_total_seconds_day_ios;

ALTER TABLE public.global_stats
RENAME COLUMN build_minutes_day_android TO build_total_seconds_day_android;

ALTER TABLE public.global_stats
RENAME COLUMN builds_day_ios TO build_count_day_ios;

ALTER TABLE public.global_stats
RENAME COLUMN builds_day_android TO build_count_day_android;

ALTER TABLE public.global_stats
ADD COLUMN build_avg_seconds_day_ios double precision DEFAULT 0 NOT NULL,
ADD COLUMN build_avg_seconds_day_android double precision DEFAULT 0 NOT NULL;

ALTER TABLE public.global_stats
ALTER COLUMN build_total_seconds_day_ios TYPE bigint USING 0,
ALTER COLUMN build_total_seconds_day_android TYPE bigint USING 0,
ALTER COLUMN build_count_day_ios TYPE integer USING COALESCE(build_count_day_ios, 0),
ALTER COLUMN build_count_day_android TYPE integer USING COALESCE(build_count_day_android, 0);

ALTER TABLE public.global_stats
ALTER COLUMN build_total_seconds_day_ios SET DEFAULT 0,
ALTER COLUMN build_total_seconds_day_android SET DEFAULT 0,
ALTER COLUMN build_count_day_ios SET DEFAULT 0,
ALTER COLUMN build_count_day_android SET DEFAULT 0;

COMMENT ON COLUMN public.global_stats.build_total_seconds_day_ios IS 'Total iOS build seconds recorded for the UTC day';
COMMENT ON COLUMN public.global_stats.build_total_seconds_day_android IS 'Total Android build seconds recorded for the UTC day';
COMMENT ON COLUMN public.global_stats.build_count_day_ios IS 'Total iOS builds recorded for the UTC day';
COMMENT ON COLUMN public.global_stats.build_count_day_android IS 'Total Android builds recorded for the UTC day';
COMMENT ON COLUMN public.global_stats.build_avg_seconds_day_ios IS 'Average iOS build duration in seconds for the UTC day';
COMMENT ON COLUMN public.global_stats.build_avg_seconds_day_android IS 'Average Android build duration in seconds for the UTC day';

UPDATE public.global_stats
SET org_conversion_rate = ROUND(COALESCE(org_conversion_rate, 0)::numeric, 1)::double precision;

WITH daily_build_stats AS (
  SELECT
    DATE(timezone('UTC', created_at)) AS date_id,
    COALESCE(SUM(build_time_unit) FILTER (WHERE platform = 'ios'), 0)::bigint AS build_total_seconds_day_ios,
    COALESCE(SUM(build_time_unit) FILTER (WHERE platform = 'android'), 0)::bigint AS build_total_seconds_day_android,
    COALESCE(COUNT(*) FILTER (WHERE platform = 'ios'), 0)::integer AS build_count_day_ios,
    COALESCE(COUNT(*) FILTER (WHERE platform = 'android'), 0)::integer AS build_count_day_android,
    COALESCE(ROUND(AVG(build_time_unit) FILTER (WHERE platform = 'ios')::numeric, 1), 0)::double precision AS build_avg_seconds_day_ios,
    COALESCE(ROUND(AVG(build_time_unit) FILTER (WHERE platform = 'android')::numeric, 1), 0)::double precision AS build_avg_seconds_day_android
  FROM public.build_logs
  WHERE platform IN ('ios', 'android')
  GROUP BY DATE(timezone('UTC', created_at))
)
UPDATE public.global_stats AS gs
SET
  build_total_seconds_day_ios = daily_build_stats.build_total_seconds_day_ios,
  build_total_seconds_day_android = daily_build_stats.build_total_seconds_day_android,
  build_count_day_ios = daily_build_stats.build_count_day_ios,
  build_count_day_android = daily_build_stats.build_count_day_android,
  build_avg_seconds_day_ios = daily_build_stats.build_avg_seconds_day_ios,
  build_avg_seconds_day_android = daily_build_stats.build_avg_seconds_day_android
FROM daily_build_stats
WHERE gs.date_id = daily_build_stats.date_id;
