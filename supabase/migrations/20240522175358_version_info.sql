-- Step 1: Create the new version_info table
CREATE TABLE version_info (
  id SERIAL PRIMARY KEY,
  app_id VARCHAR NOT NULL,
  device_id VARCHAR DEFAULT NULL,
  version_id INT NOT NULL,
  version_name VARCHAR NOT NULL,
  checksum VARCHAR,
  session_key VARCHAR,
  bucket_id VARCHAR,
  storage_provider VARCHAR,
  external_url VARCHAR,
  r2_path VARCHAR,
  min_update_version VARCHAR,
  channel_id INT,
  channel_name VARCHAR,
  allow_dev BOOLEAN,
  allow_emulator BOOLEAN,
  disable_auto_update_under_native BOOLEAN,
  disable_auto_update VARCHAR,
  ios BOOLEAN,
  android BOOLEAN,
  secondary_version_percentage INT,
  enable_progressive_deploy BOOLEAN,
  enable_ab_testing BOOLEAN,
  allow_device_self_set BOOLEAN,
  public BOOLEAN,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_version FOREIGN KEY(version_id) REFERENCES app_versions(id)
);

-- Create a partial unique index for app_id, channel_id, device_id when device_id is not null
ALTER TABLE version_info ADD CONSTRAINT version_info_unique_idx UNIQUE (app_id, channel_id, device_id);

-- CREATE UNIQUE INDEX version_info_unique_rel_idx ON version_info (app_id, channel_id, device_id);


-- Create a unique index for app_id and channel_id
-- ALTER TABLE version_info ADD CONSTRAINT version_info_app_channel_unique_idx UNIQUE (app_id, channel_id);

-- Create indexes if missing
CREATE INDEX idx_version_info_app_id ON version_info (app_id);
CREATE INDEX idx_version_info_device_id ON version_info (device_id);
CREATE INDEX idx_version_info_public ON version_info (public);
CREATE INDEX idx_version_info_ios ON version_info (ios);
CREATE INDEX idx_version_info_android ON version_info (android);

CREATE POLICY "Disable for all" ON "public"."version_info" USING (false) WITH CHECK (false);

ALTER TABLE "public"."version_info" ENABLE ROW LEVEL SECURITY;

-- Step 2: Populate the version_info table from existing data
INSERT INTO version_info (
  app_id, device_id, version_id, version_name, checksum, session_key, bucket_id,
  storage_provider, external_url, r2_path, min_update_version, channel_id, channel_name,
  allow_dev, allow_emulator, disable_auto_update_under_native, disable_auto_update,
  ios, android, secondary_version_percentage, enable_progressive_deploy,
  enable_ab_testing, allow_device_self_set, public, updated_at
)
SELECT
  av.app_id,
  cd.device_id,
  av.id AS version_id,
  av.name AS version_name,
  av.checksum,
  av.session_key,
  av.bucket_id,
  av.storage_provider,
  av.external_url,
  av.r2_path,
  av."minUpdateVersion" AS min_update_version,
  ch.id AS channel_id,
  ch.name AS channel_name,
  ch.allow_dev,
  ch.allow_emulator,
  ch."disableAutoUpdateUnderNative",
  ch."disableAutoUpdate",
  ch.ios,
  ch.android,
  ch."secondaryVersionPercentage",
  ch.enable_progressive_deploy,
  ch."enableAbTesting",
  ch.allow_device_self_set,
  ch.public,
  CURRENT_TIMESTAMP AS updated_at
FROM
  app_versions av
  LEFT JOIN channel_devices cd ON av.app_id = cd.app_id
  LEFT JOIN channels ch ON cd.channel_id = ch.id
WHERE
  av.app_id IS NOT NULL
  AND ch.public = TRUE;

-- Include public channels without specific device id
INSERT INTO version_info (
  app_id, device_id, version_id, version_name, checksum, session_key, bucket_id,
  storage_provider, external_url, r2_path, min_update_version, channel_id, channel_name,
  allow_dev, allow_emulator, disable_auto_update_under_native, disable_auto_update,
  ios, android, secondary_version_percentage, enable_progressive_deploy,
  enable_ab_testing, allow_device_self_set, public, updated_at
)
SELECT
  av.app_id,
  NULL AS device_id,
  av.id AS version_id,
  av.name AS version_name,
  av.checksum,
  av.session_key,
  av.bucket_id,
  av.storage_provider,
  av.external_url,
  av.r2_path,
  av."minUpdateVersion" AS min_update_version,
  ch.id AS channel_id,
  ch.name AS channel_name,
  ch.allow_dev,
  ch.allow_emulator,
  ch."disableAutoUpdateUnderNative" as disable_auto_update_under_native,
  ch."disableAutoUpdate" as disable_auto_update,
  ch.ios,
  ch.android,
  ch."secondaryVersionPercentage" as secondary_version_percentage,
  ch.enable_progressive_deploy,
  ch."enableAbTesting" as enable_ab_testing,
  ch.allow_device_self_set,
  ch.public,
  CURRENT_TIMESTAMP AS updated_at
FROM
  app_versions av
  INNER JOIN channels ch ON av.app_id = ch.app_id
WHERE
  ch.public = TRUE
  AND av.id = ch.version
  AND NOT EXISTS (
    SELECT 1
    FROM version_info vi
    WHERE vi.version_id = av.id
      AND vi.channel_id = ch.id
  );

-- Step 3: Trigger functions to keep version_info in sync with app_versions, channels, devices_override, channel_devices

-- Function to handle insert, update, delete on app_versions
CREATE OR REPLACE FUNCTION sync_app_versions_to_version_info()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    INSERT INTO version_info (
      app_id, device_id, version_id, version_name, checksum, session_key,
      bucket_id, storage_provider, external_url, r2_path, min_update_version,
      channel_id, channel_name, allow_dev, allow_emulator, disable_auto_update_under_native,
      disable_auto_update, ios, android, secondary_version_percentage,
      enable_progressive_deploy, enable_ab_testing, allow_device_self_set, public, updated_at
    )
    SELECT 
      NEW.app_id, cd.device_id, NEW.id AS version_id, NEW.name AS version_name, NEW.checksum, NEW.session_key, 
      NEW.bucket_id, NEW.storage_provider, NEW.external_url, NEW.r2_path, NEW."minUpdateVersion" AS min_update_version,
      ch.id AS channel_id, ch.name AS channel_name, ch.allow_dev, ch.allow_emulator, 
      ch."disableAutoUpdateUnderNative" AS disable_auto_update_under_native, 
      ch."disableAutoUpdate" AS disable_auto_update, ch.ios, ch.android, 
      ch."secondaryVersionPercentage" AS secondary_version_percentage, ch.enable_progressive_deploy, 
      ch."enableAbTesting" AS enable_ab_testing, ch.allow_device_self_set, ch.public, CURRENT_TIMESTAMP
    FROM channels ch
    LEFT JOIN channel_devices cd ON cd.channel_id = ch.id AND cd.app_id = NEW.app_id
    WHERE NEW.app_id = ch.app_id 
      AND ch.public = TRUE
    ON CONFLICT ON CONSTRAINT version_info_unique_idx
    DO UPDATE SET
      version_id = EXCLUDED.version_id,
      version_name = EXCLUDED.version_name, checksum = EXCLUDED.checksum, session_key = EXCLUDED.session_key,
      bucket_id = EXCLUDED.bucket_id, storage_provider = EXCLUDED.storage_provider, 
      external_url = EXCLUDED.external_url, r2_path = EXCLUDED.r2_path, min_update_version = EXCLUDED.min_update_version,
      disable_auto_update_under_native = EXCLUDED.disable_auto_update_under_native, disable_auto_update = EXCLUDED.disable_auto_update,
      secondary_version_percentage = EXCLUDED.secondary_version_percentage, enable_ab_testing = EXCLUDED.enable_ab_testing,
      allow_dev = EXCLUDED.allow_dev, allow_emulator = EXCLUDED.allow_emulator, enable_progressive_deploy = EXCLUDED.enable_progressive_deploy,
      allow_device_self_set = EXCLUDED.allow_device_self_set, public = EXCLUDED.public, updated_at = CURRENT_TIMESTAMP;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM version_info WHERE app_id = OLD.app_id AND version_id = OLD.id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger on app_versions
CREATE TRIGGER app_versions_sync
AFTER INSERT OR UPDATE OR DELETE ON app_versions
FOR EACH ROW
EXECUTE FUNCTION sync_app_versions_to_version_info();


-- Function to handle insert, update, delete on channels
CREATE OR REPLACE FUNCTION sync_channels_to_version_info()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.public IS FALSE THEN
      DELETE FROM version_info WHERE app_id = NEW.app_id AND channel_id = NEW.id;
      RETURN NEW;
    END IF;

    INSERT INTO version_info (
      app_id, device_id, version_id, version_name, checksum, session_key,
      bucket_id, storage_provider, external_url, r2_path, min_update_version,
      channel_id, channel_name, allow_dev, allow_emulator, disable_auto_update_under_native,
      disable_auto_update, ios, android, secondary_version_percentage,
      enable_progressive_deploy, enable_ab_testing, allow_device_self_set, public, updated_at
    )
    SELECT 
      av.app_id, NULL AS device_id, av.id AS version_id, av.name AS version_name, av.checksum, av.session_key, 
      av.bucket_id, av.storage_provider, av.external_url, av.r2_path, av."minUpdateVersion" AS min_update_version,
      NEW.id AS channel_id, NEW.name AS channel_name, NEW.allow_dev, NEW.allow_emulator, 
      NEW."disableAutoUpdateUnderNative" AS disable_auto_update_under_native, 
      NEW."disableAutoUpdate" AS disable_auto_update, NEW.ios, NEW.android, 
      NEW."secondaryVersionPercentage" AS secondary_version_percentage, NEW.enable_progressive_deploy, 
      NEW."enableAbTesting" AS enable_ab_testing, NEW.allow_device_self_set, NEW.public, CURRENT_TIMESTAMP
    FROM app_versions av
    WHERE av.app_id = NEW.app_id AND av.id = NEW.version
    ON CONFLICT ON CONSTRAINT version_info_unique_idx
    DO UPDATE SET
      version_id = EXCLUDED.version_id,
      version_name = EXCLUDED.version_name, checksum = EXCLUDED.checksum, session_key = EXCLUDED.session_key,
      bucket_id = EXCLUDED.bucket_id, storage_provider = EXCLUDED.storage_provider, 
      external_url = EXCLUDED.external_url, r2_path = EXCLUDED.r2_path, min_update_version = EXCLUDED.min_update_version,
      disable_auto_update_under_native = EXCLUDED.disable_auto_update_under_native,
      disable_auto_update = EXCLUDED.disable_auto_update,
      secondary_version_percentage = EXCLUDED.secondary_version_percentage,
      enable_ab_testing = EXCLUDED.enable_ab_testing,
      allow_dev = EXCLUDED.allow_dev, allow_emulator = EXCLUDED.allow_emulator,
      enable_progressive_deploy = EXCLUDED.enable_progressive_deploy,
      allow_device_self_set = EXCLUDED.allow_device_self_set,
      public = EXCLUDED.public,
      updated_at = CURRENT_TIMESTAMP;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM version_info WHERE app_id = OLD.app_id AND channel_id = OLD.id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;


-- Trigger on channels
CREATE TRIGGER channels_sync
AFTER INSERT OR UPDATE OR DELETE ON channels
FOR EACH ROW
EXECUTE FUNCTION sync_channels_to_version_info();

-- Function to handle insert, update, delete on channel_devices
CREATE OR REPLACE FUNCTION sync_channel_devices_to_version_info()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    INSERT INTO version_info (
      app_id, device_id, version_id, version_name, checksum, session_key,
      bucket_id, storage_provider, external_url, r2_path, min_update_version,
      channel_id, channel_name, allow_dev, allow_emulator, disable_auto_update_under_native,
      disable_auto_update, ios, android, secondary_version_percentage,
      enable_progressive_deploy, enable_ab_testing, allow_device_self_set, public, updated_at
    )
    SELECT 
      av.app_id, cd.device_id, av.id AS version_id, av.name AS version_name, av.checksum, av.session_key, 
      av.bucket_id, av.storage_provider, av.external_url, av.r2_path, av."minUpdateVersion" AS min_update_version,
      ch.id AS channel_id, ch.name AS channel_name,
      ch.allow_dev, ch.allow_emulator, ch."disableAutoUpdateUnderNative" AS disable_auto_update_under_native,
      ch."disableAutoUpdate" AS disable_auto_update,
      ch.ios, ch.android, ch."secondaryVersionPercentage" AS secondary_version_percentage,
      ch.enable_progressive_deploy,
      ch."enableAbTesting" AS enable_ab_testing, ch.allow_device_self_set, ch.public, CURRENT_TIMESTAMP
    FROM channel_devices cd
    LEFT JOIN channels ch ON cd.channel_id = ch.id
    LEFT JOIN app_versions av ON av.app_id = ch.app_id AND av.id = ch.version 
    WHERE cd.device_id = NEW.device_id AND cd.app_id = NEW.app_id
    ON CONFLICT ON CONSTRAINT version_info_unique_idx
    DO UPDATE SET
      version_name = EXCLUDED.version_name, checksum = EXCLUDED.checksum, session_key = EXCLUDED.session_key,
      bucket_id = EXCLUDED.bucket_id, storage_provider = EXCLUDED.storage_provider, 
      external_url = EXCLUDED.external_url, r2_path = EXCLUDED.r2_path, min_update_version = EXCLUDED.min_update_version,
      disable_auto_update_under_native = EXCLUDED.disable_auto_update_under_native,
      disable_auto_update = EXCLUDED.disable_auto_update,
      secondary_version_percentage = EXCLUDED.secondary_version_percentage,
      enable_ab_testing = EXCLUDED.enable_ab_testing,
      allow_dev = EXCLUDED.allow_dev, allow_emulator = EXCLUDED.allow_emulator,
      enable_progressive_deploy = EXCLUDED.enable_progressive_deploy,
      allow_device_self_set = EXCLUDED.allow_device_self_set,
      public = EXCLUDED.public,
      updated_at = CURRENT_TIMESTAMP;

    RETURN NEW;
  END IF;

  -- Delete
  IF TG_OP = 'DELETE' THEN
    DELETE FROM version_info 
    WHERE app_id = OLD.app_id 
      AND device_id = OLD.device_id 
      AND channel_id = OLD.channel_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger on channel_devices
CREATE TRIGGER channel_devices_sync
AFTER INSERT OR UPDATE OR DELETE ON channel_devices
FOR EACH ROW
EXECUTE FUNCTION sync_channel_devices_to_version_info();
