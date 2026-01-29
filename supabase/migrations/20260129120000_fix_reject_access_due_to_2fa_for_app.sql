-- ==========================================================================
-- Fix reject_access_due_to_2fa_for_app to avoid false 2FA rejections
-- ==========================================================================
-- Behavior changes:
-- 1) Non-existent apps no longer return "reject" (align with org function).
-- 2) Use get_identity_org_appid to respect app/org scoped API keys.
-- ==========================================================================

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

    -- If app not found or no owner_org, allow (no 2FA enforcement can apply)
    IF v_owner_org IS NULL THEN
        RETURN false;
    END IF;

    -- Get the current user identity (works for both JWT auth and API key)
    -- Use get_identity_org_appid to ensure org/app scoping is respected
    v_user_id := public.get_identity_org_appid('{read,upload,write,all}'::public.key_mode[], v_owner_org, reject_access_due_to_2fa_for_app.app_id);

    -- If no user identity found, allow (auth failure should be handled elsewhere)
    IF v_user_id IS NULL THEN
        RETURN false;
    END IF;

    -- Check if org has 2FA enforcement enabled
    SELECT enforcing_2fa INTO v_org_enforcing_2fa
    FROM public.orgs
    WHERE public.orgs.id = v_owner_org;

    -- If org not found, allow (no 2FA enforcement can apply)
    IF v_org_enforcing_2fa IS NULL THEN
        RETURN false;
    END IF;

    -- If org does not enforce 2FA, allow access
    IF v_org_enforcing_2fa = false THEN
        RETURN false;
    END IF;

    -- If org enforces 2FA and user doesn't have 2FA enabled, reject access
    IF v_org_enforcing_2fa = true AND NOT public.has_2fa_enabled(v_user_id) THEN
        RETURN true;
    END IF;

    -- Otherwise, allow access
    RETURN false;
END;
$$;

ALTER FUNCTION "public"."reject_access_due_to_2fa_for_app"("app_id" character varying) OWNER TO "postgres";

-- Grant permissions - accessible to authenticated, anon (for API key usage), and service_role
GRANT EXECUTE ON FUNCTION "public"."reject_access_due_to_2fa_for_app"("app_id" character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."reject_access_due_to_2fa_for_app"("app_id" character varying) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."reject_access_due_to_2fa_for_app"("app_id" character varying) TO "service_role";
