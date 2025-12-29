-- ============================================================================
-- Fix check_org_members_password_policy to allow service_role bypass
-- ============================================================================

-- Modify the function to bypass auth check when called by service_role
-- This is needed for testing and administrative purposes
CREATE OR REPLACE FUNCTION "public"."check_org_members_password_policy"("org_id" "uuid")
    RETURNS TABLE (
        "user_id" "uuid",
        "email" text,
        "first_name" text,
        "last_name" text,
        "password_policy_compliant" boolean
    )
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_is_service_role boolean;
BEGIN
    -- Check if org exists
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE public.orgs.id = check_org_members_password_policy.org_id) THEN
        RAISE EXCEPTION 'Organization does not exist';
    END IF;

    -- Check if called by service_role or postgres (similar pattern to existing codebase)
    v_is_service_role := (
        ((SELECT auth.jwt() ->> 'role') = 'service_role')
        OR ((SELECT current_user) IS NOT DISTINCT FROM 'postgres')
    );

    -- Allow service_role/postgres to bypass the auth check (for testing and admin purposes)
    IF NOT v_is_service_role THEN
        -- Check if the current user is a super_admin of the organization
        IF NOT (
            public.check_min_rights(
                'super_admin'::public.user_min_right,
                (SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], check_org_members_password_policy.org_id)),
                check_org_members_password_policy.org_id,
                NULL::character varying,
                NULL::bigint
            )
        ) THEN
            RAISE EXCEPTION 'NO_RIGHTS';
        END IF;
    END IF;

    -- Return list of org members with their password policy compliance status
    RETURN QUERY
    SELECT
        ou.user_id,
        au.email::text,
        u.first_name::text,
        u.last_name::text,
        public.user_meets_password_policy(ou.user_id, check_org_members_password_policy.org_id) AS "password_policy_compliant"
    FROM public.org_users ou
    JOIN auth.users au ON au.id = ou.user_id
    LEFT JOIN public.users u ON u.id = ou.user_id
    WHERE ou.org_id = check_org_members_password_policy.org_id;
END;
$$;
