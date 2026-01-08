-- Add columns for tracking devices by platform (iOS and Android)
ALTER TABLE global_stats
ADD COLUMN IF NOT EXISTS devices_last_month_ios bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS devices_last_month_android bigint DEFAULT 0;
