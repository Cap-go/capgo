-- Function to get organization CLI warnings
CREATE OR REPLACE FUNCTION get_organization_cli_warnings(orgid uuid, cli_version text)
RETURNS jsonb[]
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    messages jsonb[] := '{}';
    has_read_access boolean;
BEGIN
    -- Check if API key has read access
    SELECT check_min_rights('read'::user_min_right, get_identity_apikey_only('{write,all,upload,read}'::"public"."key_mode"[]), orgid, NULL::character varying, NULL::bigint) INTO has_read_access;

    IF NOT has_read_access THEN
        messages := array_append(messages, jsonb_build_object(
            'message', 'API key does not have read access to this organization',
            'fatal', true
        ));
        RETURN messages;
    END IF;

    -- test the user plan
    IF (is_paying_and_good_plan_org_action(orgid, ARRAY['mau'::action_type]) = true AND is_paying_and_good_plan_org_action(orgid, ARRAY['bandwidth'::action_type]) = true AND is_paying_and_good_plan_org_action(orgid, ARRAY['storage'::action_type]) = false) THEN
        messages := array_append(messages, jsonb_build_object(
            'message', 'You have exceeded your storage limit.\nUpload will fail, but you can still download your data.\nMAU and bandwidth limits are not exceeded.\nIn order to upload your data, please upgrade your plan here: https://web.capgo.app/settings/plans.',
            'fatal', true
        ));
    END IF;

    RETURN messages;
END;
$$;

-- Grant permissions for the new function
GRANT ALL ON FUNCTION get_organization_cli_warnings(uuid, text) TO authenticated, service_role;
