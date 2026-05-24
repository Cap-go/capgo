-- App-scoped API keys are allowed to upload only when every permission check is
-- evaluated with an app context. Existing CLIs call this warning RPC with only
-- the org id, so bridge that org-level warning check through one allowed app in
-- the same org when the request key has limited_to_apps.

CREATE OR REPLACE FUNCTION public.get_organization_cli_warnings(
    orgid uuid,
    cli_version text
) RETURNS jsonb []
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    messages jsonb[] := ARRAY[]::jsonb[];
    request_apikey text;
    api_key public.apikeys%ROWTYPE;
    fallback_app_id text;
    has_org_read boolean;
BEGIN
    PERFORM cli_version;

    has_org_read := public.cli_check_permission(
        permission_key := public.rbac_perm_org_read(),
        org_id := orgid
    );

    IF NOT has_org_read THEN
        SELECT public.get_apikey_header() INTO request_apikey;

        IF request_apikey IS NOT NULL AND request_apikey <> '' THEN
            SELECT * INTO api_key
            FROM public.find_apikey_by_value(request_apikey)
            LIMIT 1;

            IF api_key.id IS NOT NULL
                AND COALESCE(array_length(api_key.limited_to_apps, 1), 0) > 0
            THEN
                SELECT public.apps.app_id INTO fallback_app_id
                FROM public.apps
                WHERE public.apps.owner_org = orgid
                    AND public.apps.app_id = ANY(api_key.limited_to_apps)
                ORDER BY public.apps.app_id
                LIMIT 1;

                IF fallback_app_id IS NOT NULL THEN
                    has_org_read := public.cli_check_permission(
                        permission_key := public.rbac_perm_org_read(),
                        org_id := orgid,
                        app_id := fallback_app_id
                    );
                END IF;
            END IF;
        END IF;
    END IF;

    IF NOT has_org_read THEN
        messages := array_append(messages, jsonb_build_object(
            'message', 'API key does not have read access to this organization',
            'fatal', true
        ));
        RETURN messages;
    END IF;

    IF (
        public.is_paying_and_good_plan_org_action(orgid, ARRAY['mau']::public.action_type[]) = true
        AND public.is_paying_and_good_plan_org_action(orgid, ARRAY['bandwidth']::public.action_type[]) = true
        AND public.is_paying_and_good_plan_org_action(orgid, ARRAY['storage']::public.action_type[]) = false
    ) THEN
        messages := array_append(messages, jsonb_build_object(
            'message', 'You have exceeded your storage limit.\nUpload will fail, but you can still download your data.\nMAU and bandwidth limits are not exceeded.\nIn order to upload your plan, please upgrade your plan here: https://console.capgo.app/settings/plans.',
            'fatal', true
        ));
    END IF;

    RETURN messages;
END;
$$;

ALTER FUNCTION public.get_organization_cli_warnings(uuid, text)
OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_organization_cli_warnings(uuid, text)
FROM public;
GRANT EXECUTE ON FUNCTION public.get_organization_cli_warnings(uuid, text)
TO anon;
GRANT EXECUTE ON FUNCTION public.get_organization_cli_warnings(uuid, text)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_cli_warnings(uuid, text)
TO service_role;
