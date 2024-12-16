-- Remove old fields from channel table
ALTER TABLE channels
DROP COLUMN IF EXISTS "disableAutoUpdateUnderNative",
DROP COLUMN IF EXISTS "secondVersion",
DROP COLUMN IF EXISTS "secondaryVersionPercentage", 
DROP COLUMN IF EXISTS "disableAutoUpdate",
DROP COLUMN IF EXISTS "enableAbTesting";

-- Remove old field from app_versions table
ALTER TABLE app_versions
DROP COLUMN IF EXISTS "minUpdateVersion";

-- Drop triggers and functions
DROP TRIGGER IF EXISTS sync_min_update_version ON app_versions;
DROP FUNCTION IF EXISTS sync_min_update_version();

DROP TRIGGER IF EXISTS sync_disable_auto_update ON channels;
DROP FUNCTION IF EXISTS sync_disable_auto_update();
