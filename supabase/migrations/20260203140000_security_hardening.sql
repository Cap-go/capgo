-- ============================================================================
-- Security hardening: RPC exposure, auth checks, and logging redaction
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Restrict find_apikey_by_value EXECUTE to service_role
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION "public"."find_apikey_by_value"(text) FROM "anon";
REVOKE EXECUTE ON FUNCTION "public"."find_apikey_by_value"(text) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."find_apikey_by_value"(text) TO "service_role";

-- ---------------------------------------------------------------------------
-- 2) Harden get_account_removal_date (self-only or service_role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."get_account_removal_date"("user_id" "uuid") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    removal_date TIMESTAMPTZ;
    auth_uid uuid;
    auth_role text;
BEGIN
    SELECT auth.uid() INTO auth_uid;
    SELECT auth.role() INTO auth_role;

    IF auth_uid IS NULL THEN
        IF auth_role IS DISTINCT FROM 'service_role' THEN
            RAISE EXCEPTION 'Not authenticated';
        END IF;
    ELSE
        IF auth_uid <> user_id THEN
            RAISE EXCEPTION 'Permission denied';
        END IF;
    END IF;

    -- Get the removal_date for the user_id
    SELECT to_delete_accounts.removal_date INTO removal_date
    FROM public.to_delete_accounts
    WHERE account_id = user_id;

    -- Throw exception if account is not in the table
    IF removal_date IS NULL THEN
        RAISE EXCEPTION 'Account with ID % is not marked for deletion', user_id;
    END IF;

    RETURN removal_date;
END;
$$;

REVOKE EXECUTE ON FUNCTION "public"."get_account_removal_date"(uuid) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."get_account_removal_date"(uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_account_removal_date"(uuid) TO "service_role";

-- ---------------------------------------------------------------------------
-- 3) Prevent org-id enumeration via get_user_main_org_id_by_app_id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org_id uuid;
  auth_uid uuid;
  auth_role text;
  api_user_id uuid;
BEGIN
  SELECT apps.owner_org INTO org_id
  FROM public.apps
  WHERE ((apps.app_id)::text = (get_user_main_org_id_by_app_id.app_id)::text)
  LIMIT 1;

  IF org_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT auth.uid() INTO auth_uid;
  IF auth_uid IS NOT NULL THEN
    IF public.check_min_rights('read'::public.user_min_right, auth_uid, org_id, get_user_main_org_id_by_app_id.app_id, NULL::bigint) THEN
      RETURN org_id;
    END IF;
    RETURN NULL;
  END IF;

  SELECT auth.role() INTO auth_role;
  IF auth_role = 'service_role' THEN
    RETURN org_id;
  END IF;

  SELECT public.get_identity_org_appid('{read,upload,write,all}'::public.key_mode[], org_id, get_user_main_org_id_by_app_id.app_id) INTO api_user_id;
  IF api_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF public.check_min_rights('read'::public.user_min_right, api_user_id, org_id, get_user_main_org_id_by_app_id.app_id, NULL::bigint) THEN
    RETURN org_id;
  END IF;

  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Redact PII from invite_user_to_org logging
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."invite_user_to_org" (
  "email" varchar,
  "org_id" uuid,
  "invite_type" public.user_min_right
) RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  org record;
  invited_user record;
  current_record record;
  current_tmp_user record;
  calling_user_id uuid;
BEGIN
  -- Get the calling user's ID
  SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], invite_user_to_org.org_id)
  INTO calling_user_id;

  -- Check if org exists
  SELECT * INTO org FROM public.orgs WHERE public.orgs.id=invite_user_to_org.org_id;
  IF org IS NULL THEN
    RETURN 'NO_ORG';
  END IF;

  -- Check if user has at least public.rbac_right_admin() rights
  IF NOT public.check_min_rights(public.rbac_right_admin()::public.user_min_right, calling_user_id, invite_user_to_org.org_id, NULL::varchar, NULL::bigint) THEN
    PERFORM public.pg_log('deny: NO_RIGHTS_ADMIN', jsonb_build_object('org_id', invite_user_to_org.org_id, 'invite_type', invite_user_to_org.invite_type));
    RETURN 'NO_RIGHTS';
  END IF;

  -- If inviting as super_admin, caller must be super_admin
  IF (invite_type = public.rbac_right_super_admin()::public.user_min_right OR invite_type = public.rbac_right_invite_super_admin()::public.user_min_right) THEN
    IF NOT public.check_min_rights(public.rbac_right_super_admin()::public.user_min_right, calling_user_id, invite_user_to_org.org_id, NULL::varchar, NULL::bigint) THEN
      PERFORM public.pg_log('deny: NO_RIGHTS_SUPER_ADMIN', jsonb_build_object('org_id', invite_user_to_org.org_id, 'invite_type', invite_user_to_org.invite_type));
      RETURN 'NO_RIGHTS';
    END IF;
  END IF;

  -- Check if user already exists
  SELECT public.users.id INTO invited_user FROM public.users WHERE public.users.email=invite_user_to_org.email;

  IF invited_user IS NOT NULL THEN
    -- User exists, check if already in org
    SELECT public.org_users.id INTO current_record
    FROM public.org_users
    WHERE public.org_users.user_id=invited_user.id
    AND public.org_users.org_id=invite_user_to_org.org_id;

    IF current_record IS NOT NULL THEN
      RETURN 'ALREADY_INVITED';
    ELSE
      -- Add user to org
      INSERT INTO public.org_users (user_id, org_id, user_right)
      VALUES (invited_user.id, invite_user_to_org.org_id, invite_type);
      RETURN 'OK';
    END IF;
  ELSE
    -- User doesn't exist, check tmp_users for pending invitations
    SELECT * INTO current_tmp_user
    FROM public.tmp_users
    WHERE public.tmp_users.email=invite_user_to_org.email
    AND public.tmp_users.org_id=invite_user_to_org.org_id;

    IF current_tmp_user IS NOT NULL THEN
      -- Invitation already exists
      IF current_tmp_user.cancelled_at IS NOT NULL THEN
        -- Invitation was cancelled, check if recent
        IF current_tmp_user.cancelled_at > (CURRENT_TIMESTAMP - INTERVAL '3 hours') THEN
          RETURN 'TOO_RECENT_INVITATION_CANCELATION';
        ELSE
          RETURN 'NO_EMAIL';
        END IF;
      ELSE
        RETURN 'ALREADY_INVITED';
      END IF;
    ELSE
      -- No invitation exists, need to create one (handled elsewhere)
      RETURN 'NO_EMAIL';
    END IF;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Remove default EXECUTE grants for functions to anon/authenticated
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "authenticated";
