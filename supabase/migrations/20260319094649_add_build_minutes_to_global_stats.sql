ALTER TABLE public.global_stats
ADD COLUMN build_minutes_day_ios double precision DEFAULT 0 NOT NULL,
ADD COLUMN build_minutes_day_android double precision DEFAULT 0 NOT NULL,
ADD COLUMN builds_day_ios integer DEFAULT 0 NOT NULL,
ADD COLUMN builds_day_android integer DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS idx_build_logs_created_at_platform
ON public.build_logs (created_at, platform);

COMMENT ON COLUMN public.global_stats.build_minutes_day_ios IS 'Total iOS build minutes recorded for the day';
COMMENT ON COLUMN public.global_stats.build_minutes_day_android IS 'Total Android build minutes recorded for the day';
COMMENT ON COLUMN public.global_stats.builds_day_ios IS 'Total iOS builds counted for the day';
COMMENT ON COLUMN public.global_stats.builds_day_android IS 'Total Android builds counted for the day';
