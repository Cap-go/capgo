-- Add missing rights for new tables
ALTER TABLE "public"."version_meta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."version_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."storage_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."device_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."bandwidth_usage" ENABLE ROW LEVEL SECURITY;
AlTER TABLE "public"."daily_mau" ENABLE ROW LEVEL SECURITY;
AlTER TABLE "public"."daily_bandwidth" ENABLE ROW LEVEL SECURITY;
AlTER TABLE "public"."daily_storage" ENABLE ROW LEVEL SECURITY;
AlTER TABLE "public"."daily_version" ENABLE ROW LEVEL SECURITY;
AlTER TABLE "public"."stats" ENABLE ROW LEVEL SECURITY;
AlTER TABLE "public"."devices" ENABLE ROW LEVEL SECURITY;

-- Cleanup the notifications table and modify it to have better clarity
TRUNCATE TABLE notifications;

-- Drop the 'id' column
ALTER TABLE notifications
DROP COLUMN id;

-- Add the 'event' column
ALTER TABLE notifications
ADD COLUMN event VARCHAR(255);

-- Add the 'uniq_id' column
ALTER TABLE notifications
ADD COLUMN uniq_id VARCHAR(255);

-- Set 'event' and 'uniq_id' as the primary key
ALTER TABLE notifications
ADD PRIMARY KEY (event, uniq_id);

