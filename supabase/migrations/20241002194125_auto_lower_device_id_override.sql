-- File: devices_override_case_insensitive_migration.sql

-- Ensure device_id_lower column exists (it should already exist based on the provided schema)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'devices_override' AND column_name = 'device_id_lower') THEN
        ALTER TABLE devices_override
        ADD COLUMN device_id_lower text GENERATED ALWAYS AS (LOWER(device_id)) STORED;
    END IF;
END $$;

-- Ensure primary key uses device_id_lower (it should already be set based on the provided schema)
ALTER TABLE devices_override
DROP CONSTRAINT IF EXISTS devices_override_pkey;

ALTER TABLE devices_override
ADD CONSTRAINT devices_override_pkey PRIMARY KEY (app_id, device_id_lower);

-- Update index to use device_id_lower
DROP INDEX IF EXISTS idx_app_id_device_id_devices_override;
CREATE INDEX IF NOT EXISTS idx_app_id_device_id_lower_devices_override 
ON public.devices_override USING btree (app_id, device_id_lower);

-- Create or replace normalization function (if not already created in channel_devices migration)
CREATE OR REPLACE FUNCTION normalize_device_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.device_id = LOWER(NEW.device_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger exists (it should already exist based on the provided schema)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'normalize_device_id_devices_override_trigger') THEN
    CREATE TRIGGER normalize_device_id_devices_override_trigger
    BEFORE INSERT OR UPDATE ON devices_override
    FOR EACH ROW EXECUTE FUNCTION normalize_device_id();
  END IF;
END $$;

-- Update existing data to lowercase
UPDATE devices_override SET device_id = LOWER(device_id) WHERE device_id <> LOWER(device_id);
