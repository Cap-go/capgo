-- Drop devices_override table
DROP TABLE IF EXISTS devices_override;

-- Remove fields from channel table
ALTER TABLE channels
DROP COLUMN IF EXISTS secondary_version_percentage,
DROP COLUMN IF EXISTS enable_progressive_deploy,
DROP COLUMN IF EXISTS enable_ab_testing,
DROP COLUMN IF EXISTS second_version,
DROP COLUMN IF EXISTS beta;

ALTER TABLE app_versions
DROP COLUMN IF EXISTS bucket_id;
