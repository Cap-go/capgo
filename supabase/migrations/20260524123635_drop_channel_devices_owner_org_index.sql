-- channel_devices runtime lookups use app_id/device_id or channel_id.
-- Supabase migrations run in a transaction, so this cannot use DROP INDEX CONCURRENTLY.
DROP INDEX IF EXISTS "public"."finx_channel_devices_owner_org";
