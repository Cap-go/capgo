-- Delete duplicates keeping only the newest entry
DELETE FROM devices_override a
USING devices_override b
WHERE a.device_id = b.device_id 
  AND a.app_id = b.app_id 
  AND a.created_at < b.created_at;

-- Add unique constraint
ALTER TABLE devices_override 
ADD CONSTRAINT unique_device_id_app_id UNIQUE (device_id, app_id);

WITH duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY LOWER(device_id) ORDER BY created_at DESC) AS row_num
    FROM public.channel_devices
)
DELETE FROM public.channel_devices
WHERE id IN (
    SELECT id
    FROM duplicates
    WHERE row_num > 1
);

ALTER TABLE public.channel_devices
ADD CONSTRAINT unique_device_app UNIQUE (device_id, app_id);
