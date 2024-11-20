CREATE OR REPLACE PROCEDURE "public"."update_app_versions_retention"()
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE app_versions
    SET deleted = true
    where extract(epoch from now()) - extract(epoch from app_versions.created_at) > ((select retention from apps where app_id=app_versions.app_id))
    AND NOT EXISTS (
        SELECT 1
        FROM channels
        WHERE app_id = app_versions.app_id
          AND app_versions.id IN (channels.version, channels.second_version)
    )
    AND NOT EXISTS (
        SELECT 1
        FROM devices_override
        WHERE app_id = app_versions.app_id
        AND version=app_versions.id
    );
END;
$$;