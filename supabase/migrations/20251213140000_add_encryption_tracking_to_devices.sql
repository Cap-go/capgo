-- Add encryption key prefix column to devices table
ALTER TABLE public.devices
ADD COLUMN key_id character varying(4);

-- Add comment to explain the column
COMMENT ON COLUMN public.devices.key_id IS 'First 4 characters of the base64-encoded public key (identifies which key is in use)';

-- Create index for better query performance on key_id
CREATE INDEX IF NOT EXISTS idx_devices_key_id ON public.devices (key_id)
WHERE key_id IS NOT NULL;

ALTER TABLE public.app_versions
ADD COLUMN key_id character varying(4);

-- Add comment to explain the column
COMMENT ON COLUMN public.app_versions.key_id IS 'First 4 characters of the base64-encoded public key used to encrypt this bundle (identifies which key was used for encryption)';

-- Create index for better query performance on key_id
CREATE INDEX IF NOT EXISTS idx_app_versions_key_id ON public.app_versions (key_id)
WHERE key_id IS NOT NULL;
