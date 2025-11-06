-- Add default_channel column to devices table to track which channel the device is configured to use
ALTER TABLE public.devices
ADD COLUMN default_channel character varying(255);

-- Add comment to explain the column
COMMENT ON COLUMN public.devices.default_channel IS 'The default channel name that the device is configured to request updates from';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_devices_default_channel ON public.devices (default_channel);
