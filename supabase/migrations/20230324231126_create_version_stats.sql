
CREATE OR REPLACE FUNCTION public.update_version_stats(app_id character varying, version_id bigint, install bigint, uninstall bigint, fail bigint)
 RETURNS void
 LANGUAGE sql
AS $function$
  UPDATE app_versions_meta
  SET installs = installs + update_version_stats.install,
    uninstalls = uninstalls + update_version_stats.uninstall,
    devices = get_devices_version(app_id, version_id),
    fails = fails + update_version_stats.fail
  where app_versions_meta.id = update_version_stats.version_id and
  app_versions_meta.app_id = update_version_stats.app_id
$function$
