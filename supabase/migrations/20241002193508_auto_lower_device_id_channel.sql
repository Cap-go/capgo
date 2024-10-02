-- File: channel_devices_case_insensitive_migration.sql

-- Add device_id_lower column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'channel_devices' AND column_name = 'device_id_lower') THEN
        ALTER TABLE channel_devices
        ADD COLUMN device_id_lower text GENERATED ALWAYS AS (LOWER(device_id)) STORED;
    END IF;
END $$;

-- Update primary key
ALTER TABLE channel_devices
DROP CONSTRAINT IF EXISTS channel_devices_pkey;

ALTER TABLE channel_devices
ADD CONSTRAINT channel_devices_pkey PRIMARY KEY (app_id, device_id_lower);

-- Update unique index
DROP INDEX IF EXISTS idx_app_id_device_id_channel_id_channel_devices;
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_id_device_id_lower_channel_id_channel_devices 
ON public.channel_devices (app_id, device_id_lower, channel_id);

-- Update existing index
DROP INDEX IF EXISTS finx_channel_devices_app_id;
CREATE INDEX IF NOT EXISTS finx_channel_devices_app_id 
ON public.channel_devices USING btree (app_id, device_id_lower);

-- Create or replace normalization function
CREATE OR REPLACE FUNCTION normalize_device_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.device_id = LOWER(NEW.device_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'normalize_device_id_channel_devices_trigger') THEN
    CREATE TRIGGER normalize_device_id_channel_devices_trigger
    BEFORE INSERT OR UPDATE ON channel_devices
    FOR EACH ROW EXECUTE FUNCTION normalize_device_id();
  END IF;
END $$;

-- Update existing data to lowercase
UPDATE channel_devices SET device_id = LOWER(device_id) WHERE device_id <> LOWER(device_id);
