CREATE OR REPLACE FUNCTION public.check_revert_to_builtin_version(appId character varying)
 RETURNS INTEGER
 LANGUAGE plpgsql
AS $function$
BEGIN
    DECLARE
        version_id INTEGER;
    BEGIN
        SELECT id
        INTO version_id
        FROM app_versions
        WHERE name = 'revert_to_builtin'
        AND appid = appId;

        IF NOT FOUND THEN
            INSERT INTO app_versions(name, app_id, storage_provider)
            VALUES ('revert_to_builtin', appId, 'revert_to_builtin')
            RETURNING id INTO version_id;
        END IF;

        RETURN version_id;
    END;
END;
$function$