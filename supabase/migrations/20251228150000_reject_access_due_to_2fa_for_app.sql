-- ============================================================================
-- Public function to check if access should be rejected due to 2FA enforcement
-- for a given app. This is intended for CLI and frontend use.
-- ============================================================================

-- Function to check if access should be rejected due to 2FA enforcement for an app
-- Takes app_id, gets the owner_org, gets current user identity, and checks 2FA compliance
-- Returns true if access should be REJECTED, false if access should be ALLOWED
CREATE OR REPLACE FUNCTION "public"."reject_access_due_to_2fa_for_app"("app_id" character varying)
    RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_owner_org uuid;
    v_user_id uuid;
    v_org_enforcing_2fa boolean;
BEGIN
    -- Get the owner organization for this app
    SELECT owner_org INTO v_owner_org
    FROM public.apps
    WHERE public.apps.app_id = reject_access_due_to_2fa_for_app.app_id;

    -- If app not found or no owner_org, reject access
    IF v_owner_org IS NULL THEN
        RETURN true;
    END IF;

    -- Get the current user identity (works for both JWT auth and API key)
    -- Using get_identity with key_mode array to support CLI API key authentication
    v_user_id := public.get_identity('{read,upload,write,all}'::public.key_mode[]);

    -- If no user identity found, reject access
    IF v_user_id IS NULL THEN
        RETURN true;
    END IF;

    -- Check if org has 2FA enforcement enabled
    SELECT enforcing_2fa INTO v_org_enforcing_2fa
    FROM public.orgs
    WHERE public.orgs.id = v_owner_org;

    -- If org not found, reject access
    IF v_org_enforcing_2fa IS NULL THEN
        RETURN true;
    END IF;

    -- If org does not enforce 2FA, allow access
    IF v_org_enforcing_2fa = false THEN
        RETURN false;
    END IF;

    -- If org enforces 2FA and user doesn't have 2FA enabled, reject access
    -- Use has_2fa_enabled(user_id) to check the specific user (works for API key auth)
    IF v_org_enforcing_2fa = true AND NOT public.has_2fa_enabled(v_user_id) THEN
        RETURN true;
    END IF;

    -- Otherwise, allow access
    RETURN false;
END;
$$;

ALTER FUNCTION "public"."reject_access_due_to_2fa_for_app"("app_id" character varying) OWNER TO "postgres";

-- Grant permissions - accessible to authenticated, anon (for API key usage), and service_role
-- Note: anon is needed because API key requests come in as anon role with capgkey header
GRANT EXECUTE ON FUNCTION "public"."reject_access_due_to_2fa_for_app"("app_id" character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."reject_access_due_to_2fa_for_app"("app_id" character varying) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."reject_access_due_to_2fa_for_app"("app_id" character varying) TO "service_role";

