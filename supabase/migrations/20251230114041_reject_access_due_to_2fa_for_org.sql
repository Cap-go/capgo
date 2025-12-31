-- ============================================================================
-- Public function to check if access should be rejected due to 2FA enforcement
-- for a given org. This is intended for CLI and frontend use.
-- ============================================================================

-- Function to check if access should be rejected due to 2FA enforcement for an org
-- Takes org_id directly, gets current user identity, and checks 2FA compliance
-- Returns true if access should be REJECTED, false if access should be ALLOWED
CREATE OR REPLACE FUNCTION "public"."reject_access_due_to_2fa_for_org"("org_id" uuid)
    RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_user_id uuid;
    v_org_enforcing_2fa boolean;
BEGIN
    -- Get the current user identity (works for both JWT auth and API key)
    -- NOTE: We use get_identity_org_allowed (not get_identity like the app version) because
    -- this function takes an org_id directly, so we must validate that the API key
    -- has access to this specific org before checking 2FA compliance.
    -- This prevents org-limited API keys from bypassing org access restrictions.
    v_user_id := public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], reject_access_due_to_2fa_for_org.org_id);

    -- If no user identity found, reject access
    IF v_user_id IS NULL THEN
        RETURN true;
    END IF;

    -- Check if org has 2FA enforcement enabled
    SELECT enforcing_2fa INTO v_org_enforcing_2fa
    FROM public.orgs
    WHERE public.orgs.id = reject_access_due_to_2fa_for_org.org_id;

    -- If org not found, allow access (no 2FA enforcement can apply to a non-existent org)
    IF v_org_enforcing_2fa IS NULL THEN
        RETURN false;
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

ALTER FUNCTION "public"."reject_access_due_to_2fa_for_org"("org_id" uuid) OWNER TO "postgres";

-- Grant permissions - accessible to authenticated, anon (for API key usage), and service_role
-- Note: anon is needed because API key requests come in as anon role with capgkey header
GRANT EXECUTE ON FUNCTION "public"."reject_access_due_to_2fa_for_org"("org_id" uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."reject_access_due_to_2fa_for_org"("org_id" uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."reject_access_due_to_2fa_for_org"("org_id" uuid) TO "service_role";
