-- Migration to add build statistics columns to global_stats table
-- These columns will track total builds (all time) and last month builds

-- Add columns to global_stats table
ALTER TABLE public.global_stats
ADD COLUMN IF NOT EXISTS builds_total bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS builds_ios bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS builds_android bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS builds_last_month bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS builds_last_month_ios bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS builds_last_month_android bigint DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.global_stats.builds_total IS 'Total number of native builds recorded (all time)';
COMMENT ON COLUMN public.global_stats.builds_ios IS 'Total number of iOS native builds recorded (all time)';
COMMENT ON COLUMN public.global_stats.builds_android IS 'Total number of Android native builds recorded (all time)';
COMMENT ON COLUMN public.global_stats.builds_last_month IS 'Number of native builds in the last 30 days';
COMMENT ON COLUMN public.global_stats.builds_last_month_ios IS 'Number of iOS native builds in the last 30 days';
COMMENT ON COLUMN public.global_stats.builds_last_month_android IS 'Number of Android native builds in the last 30 days';
