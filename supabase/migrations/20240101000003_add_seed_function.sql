CREATE OR REPLACE FUNCTION public.reset_and_seed_app_data(p_app_id character varying) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    org_id uuid := '046a36ac-e03c-4590-9257-bd6c9dba9ee8';
    user_id uuid := '6aa76066-55ef-4238-ade6-0b32334a4097';
    max_version_id bigint;
    max_channel_id bigint;
BEGIN
    -- Lock the tables to prevent concurrent inserts
    LOCK TABLE app_versions, channels IN EXCLUSIVE MODE;
    
    -- Delete existing data for the specified app_id
    DELETE FROM channels WHERE app_id = p_app_id;
    DELETE FROM app_versions WHERE app_id = p_app_id;
    DELETE FROM apps WHERE app_id = p_app_id;

    -- Get the current max ids and reset the sequences
    SELECT COALESCE(MAX(id), 0) + 1 INTO max_version_id FROM app_versions;
    SELECT COALESCE(MAX(id), 0) + 1 INTO max_channel_id FROM channels;
    
    -- Reset both sequences
    PERFORM setval('app_versions_id_seq', max_version_id, false);
    PERFORM setval('channel_id_seq', max_channel_id, false);

    -- Insert new app data
    INSERT INTO apps (created_at, app_id, icon_url, name, last_version, updated_at, owner_org, user_id)
    VALUES (now(), p_app_id, '', 'Seeded App', '1.0.0', now(), org_id, user_id);

    -- Insert app versions in a single statement
    WITH inserted_versions AS (
        INSERT INTO app_versions (created_at, app_id, name, r2_path, updated_at, deleted, external_url, checksum, storage_provider, owner_org)
        VALUES 
            (now(), p_app_id, 'builtin', NULL, now(), 't', NULL, NULL, 'supabase', org_id),
            (now(), p_app_id, 'unknown', NULL, now(), 't', NULL, NULL, 'supabase', org_id),
            (now(), p_app_id, '1.0.1', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.0.1.zip', now(), 'f', NULL, '', 'r2-direct', org_id),
            (now(), p_app_id, '1.0.0', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.0.0.zip', now(), 'f', NULL, '3885ee49', 'r2', org_id),
            (now(), p_app_id, '1.361.0', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.361.0.zip', now(), 'f', NULL, '9d4f798a', 'r2', org_id),
            (now(), p_app_id, '1.360.0', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.360.0.zip', now(), 'f', NULL, '44913a9f', 'r2', org_id),
            (now(), p_app_id, '1.359.0', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.359.0.zip', now(), 'f', NULL, '9f74e70a', 'r2', org_id)
        RETURNING id, name
    )
    -- Insert channels using the version IDs from the CTE
    INSERT INTO channels (created_at, name, app_id, version, updated_at, public, disable_auto_update_under_native, disable_auto_update, ios, android, allow_device_self_set, allow_emulator, allow_dev, owner_org)
    SELECT 
        now(),
        c.name,
        p_app_id,
        v.id,
        now(),
        c.is_public,
        't',
        'major',
        c.ios,
        c.android,
        't',
        't',
        't',
        org_id
    FROM (
        VALUES 
            ('production', '1.0.0', true, false, true),
            ('no_access', '1.361.0', false, true, true),
            ('two_default', '1.0.0', true, true, false)
    ) as c(name, version_name, is_public, ios, android)
    JOIN inserted_versions v ON v.name = c.version_name;

END;
$$;

REVOKE ALL ON FUNCTION public.reset_and_seed_app_data(p_app_id character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reset_and_seed_app_data(p_app_id character varying) TO service_role;
