CREATE INDEX CONCURRENTLY IF NOT EXISTS
idx_devices_app_id_plugin_version_production
ON public.devices USING btree (app_id, plugin_version)
WHERE is_prod IS TRUE
AND is_emulator IS NOT TRUE;
