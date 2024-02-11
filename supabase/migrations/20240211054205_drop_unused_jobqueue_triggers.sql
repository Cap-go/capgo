drop trigger on_app_delete_sql on apps;
drop trigger on_app_versions_delete_sql on app_versions;
drop trigger on_device_delete_sql on devices;

DROP FUNCTION on_app_version_delete_sql();
DROP FUNCTION on_app_delete_sql();
DROP FUNCTION on_device_delete_sql();