-- channel_devices_app_id_device_id_key already enforces one device per app.
-- Keep channel_devices_device_id_idx for device_id-only lookup paths.
ALTER TABLE "public"."channel_devices"
  DROP CONSTRAINT IF EXISTS "unique_device_app";
