-- Warn users on @capgo/cli versions older than 7.107.0 when their API key
-- would hit the appid-passthrough RBAC bug fixed by PR #2282.
--
-- The bug: is_allowed_action_org_action(orgid, actions) calls check_min_rights
-- with app_id = NULL. For an RBAC-managed key (mode IS NULL) with
-- limited_to_apps set, on an org with use_new_rbac = true,
-- rbac_check_permission_direct denies the call because the key is restricted
-- to apps but no app context was provided. The CLI surfaces this as the
-- misleading "Plan upgrade required for upload" error.
--
-- The fix shipped in @capgo/cli@7.107.0. For users still running older CLIs,
-- this warning fires fatally during checkRemoteCliMessages (which runs BEFORE
-- checkPlanValidUpload), replacing the misleading billing error with an
-- actionable one that explains the bug, the upgrade target, and the
-- workaround.
--
-- Scope: RBAC v2 keys only (mode IS NULL with role_bindings). Legacy keys
-- (mode IN ('read','write','upload','all')) with limited_to_apps would also
-- hit the bug on use_new_rbac orgs, but the user-requested scope is RBAC v2.

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
    org_uses_new_rbac boolean;
    cli_version_match text[];
    cli_version_parts int[];
    -- Lowest @capgo/cli release that contains the PR #2282 fix.
    fix_cli_version constant int[] := ARRAY[7, 107, 0];
BEGIN
    PERFORM cli_version;

    has_org_read := public.cli_check_permission(
        permission_key := public.rbac_perm_org_read(),
        org_id := orgid
    );

    SELECT public.get_apikey_header() INTO request_apikey;

    IF request_apikey IS NOT NULL AND request_apikey <> '' THEN
        SELECT * INTO api_key
        FROM public.find_apikey_by_value(request_apikey)
        LIMIT 1;
    END IF;

    IF NOT has_org_read THEN
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

    -- PR #2282 warning. Triggers only when ALL of the following are true:
    --   1. Caller's API key is RBAC v2 (mode IS NULL).
    --   2. Key has limited_to_apps set (the gate that trips inside RBAC).
    --   3. Org has use_new_rbac = true (the gate routes through
    --      rbac_check_permission_direct only when RBAC is enabled).
    --   4. CLI version parses cleanly and sits below 7.107.0.
    IF api_key.id IS NOT NULL
        AND api_key.mode IS NULL
        AND COALESCE(array_length(api_key.limited_to_apps, 1), 0) > 0
    THEN
        SELECT COALESCE(o.use_new_rbac, false) INTO org_uses_new_rbac
        FROM public.orgs o
        WHERE o.id = orgid;

        IF COALESCE(org_uses_new_rbac, false) THEN
            -- Parse leading X.Y.Z. Unparseable versions (empty string, "dev",
            -- "next") fall through without firing the warning - safer to be
            -- silent than to nag on non-release builds.
            cli_version_match := regexp_match(cli_version, '^([0-9]+)\.([0-9]+)\.([0-9]+)');
            IF cli_version_match IS NOT NULL THEN
                cli_version_parts := ARRAY[
                    cli_version_match[1]::int,
                    cli_version_match[2]::int,
                    cli_version_match[3]::int
                ];

                IF cli_version_parts < fix_cli_version THEN
                    messages := array_append(messages, jsonb_build_object(
                        'message',
                        'Your CLI version (' || cli_version || ') has a known bug affecting RBAC-managed API keys restricted to specific apps.\n' ||
                        'Uploads with this key fail with "Plan upgrade required for upload" even when your plan is healthy.\n' ||
                        'Fix: upgrade to @capgo/cli@7.107.0 or newer:\n' ||
                        '    npm i -g @capgo/cli@latest\n' ||
                        'Workaround if you cannot upgrade: remove the app restriction (limited_to_apps) on this API key, leaving only the org restriction. See https://github.com/Cap-go/capgo/pull/2282 for context.',
                        'fatal', true
                    ));
                END IF;
            END IF;
        END IF;
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
