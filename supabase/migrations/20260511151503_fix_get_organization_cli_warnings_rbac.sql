-- Fix get_organization_cli_warnings so RBAC v2 API keys (NULL mode, permissions
-- via role_bindings) pass the org.read check. Previously this function relied on
-- get_identity_apikey_only({write,all,upload,read}) which returns NULL when
-- apikeys.mode IS NULL, making check_min_rights return false even for keys with
-- valid RBAC bindings. Swap to cli_check_permission, the canonical CLI-facing
-- auth oracle that handles header read, expiry, and both legacy + RBAC keys.

CREATE OR REPLACE FUNCTION "public"."get_organization_cli_warnings" (
    "orgid" uuid,
    "cli_version" text
) RETURNS jsonb[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    messages jsonb[] := ARRAY[]::jsonb[];
BEGIN
    PERFORM cli_version;

    IF NOT public.cli_check_permission(
        permission_key := public.rbac_perm_org_read(),
        org_id := orgid
    ) THEN
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
