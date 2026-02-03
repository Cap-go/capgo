-- Remove app/channel/bundle permissions from org_member role
DO $$
DECLARE
  v_role_id uuid;
BEGIN
  SELECT id INTO v_role_id
  FROM public.roles
  WHERE name = public.rbac_role_org_member()
  LIMIT 1;

  IF v_role_id IS NULL THEN
    RAISE NOTICE 'org_member role not found, skipping permission cleanup';
    RETURN;
  END IF;

  DELETE FROM public.role_permissions rp
  USING public.permissions p
  WHERE rp.role_id = v_role_id
    AND rp.permission_id = p.id
    AND p.scope_type IN (
      public.rbac_scope_app(),
      public.rbac_scope_bundle(),
      public.rbac_scope_channel()
    );

  UPDATE public.roles
  SET description = 'Basic org member: org-only access'
  WHERE name = public.rbac_role_org_member();
END $$;

-- Prevent admin privilege escalation when RBAC is enabled
CREATE OR REPLACE FUNCTION public.check_org_user_privileges() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
DECLARE
  v_is_super_admin boolean := false;
  v_use_rbac boolean := false;
BEGIN
  -- Allow service_role / postgres to bypass
  IF (((SELECT auth.jwt() ->> 'role') = 'service_role') OR ((SELECT current_user) IS NOT DISTINCT FROM 'postgres')) THEN
    RETURN NEW;
  END IF;

  v_use_rbac := public.rbac_is_enabled_for_org(NEW.org_id);

  IF v_use_rbac THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.role_bindings rb
      JOIN public.roles r ON r.id = rb.role_id
      WHERE rb.principal_type = public.rbac_principal_user()
        AND rb.principal_id = auth.uid()
        AND (
          (rb.scope_type = public.rbac_scope_org()
            AND rb.org_id = NEW.org_id
            AND r.name = public.rbac_role_org_super_admin())
          OR
          (rb.scope_type = public.rbac_scope_platform()
            AND r.name = public.rbac_role_platform_super_admin())
        )
    ) INTO v_is_super_admin;
  ELSE
    v_is_super_admin := public.check_min_rights(
      'super_admin'::public.user_min_right,
      (SELECT auth.uid()),
      NEW.org_id,
      NULL::character varying,
      NULL::bigint
    );
  END IF;

  IF v_is_super_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.user_right IS NOT DISTINCT FROM 'super_admin'::public.user_min_right THEN
    PERFORM public.pg_log('deny: ELEVATE_SUPER_ADMIN', jsonb_build_object('org_id', NEW.org_id, 'uid', auth.uid()));
    RAISE EXCEPTION 'Admins cannot elevate privileges!';
  END IF;

  IF NEW.user_right IS NOT DISTINCT FROM 'invite_super_admin'::public.user_min_right THEN
    PERFORM public.pg_log('deny: ELEVATE_INVITE_SUPER_ADMIN', jsonb_build_object('org_id', NEW.org_id, 'uid', auth.uid()));
    RAISE EXCEPTION 'Admins cannot elevate privileges!';
  END IF;

  RETURN NEW;
END;
$$;

-- Support hashed keys and RBAC fallback for app access checks
CREATE OR REPLACE FUNCTION public.has_app_right_apikey(
  "appid" character varying,
  "right" public.user_min_right,
  "userid" uuid,
  "apikey" text
) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  org_id uuid;
  api_key record;
  allowed boolean := false;
  use_rbac boolean;
  perm_key text;
  has_apikey_roles boolean := false;
BEGIN
  org_id := public.get_user_main_org_id_by_app_id("appid");
  use_rbac := public.rbac_is_enabled_for_org(org_id);

  -- Support both plain and hashed keys
  SELECT * FROM public.find_apikey_by_value("apikey") INTO api_key;

  IF api_key.id IS NULL THEN
    PERFORM public.pg_log('deny: INVALID_APIKEY', jsonb_build_object('appid', "appid"));
    RETURN false;
  END IF;

  IF public.is_apikey_expired(api_key.expires_at) THEN
    PERFORM public.pg_log('deny: APIKEY_EXPIRED', jsonb_build_object('appid', "appid", 'org_id', org_id, 'apikey_id', api_key.id));
    RETURN false;
  END IF;

  IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
    IF NOT (org_id = ANY(api_key.limited_to_orgs)) THEN
      PERFORM public.pg_log('deny: APIKEY_ORG_RESTRICT', jsonb_build_object('org_id', org_id, 'appid', "appid"));
      RETURN false;
    END IF;
  END IF;

  IF api_key.limited_to_apps IS DISTINCT FROM '{}' THEN
    IF NOT ("appid" = ANY(api_key.limited_to_apps)) THEN
      PERFORM public.pg_log('deny: APIKEY_APP_RESTRICT', jsonb_build_object('appid', "appid"));
      RETURN false;
    END IF;
  END IF;

  IF use_rbac THEN
    perm_key := public.rbac_permission_for_legacy("right", public.rbac_scope_app());

    IF api_key.rbac_id IS NOT NULL THEN
      allowed := public.rbac_has_permission(public.rbac_principal_apikey(), api_key.rbac_id, perm_key, org_id, "appid", NULL::bigint);
      SELECT EXISTS (
        SELECT 1
        FROM public.role_bindings rb
        WHERE rb.principal_type = public.rbac_principal_apikey()
          AND rb.principal_id = api_key.rbac_id
      ) INTO has_apikey_roles;
    END IF;

    -- Compatibility: if no RBAC bindings exist for the key, fall back to legacy rights
    IF NOT allowed AND NOT has_apikey_roles THEN
      allowed := public.check_min_rights("right", "userid", org_id, "appid", NULL::bigint);
    END IF;
  ELSE
    allowed := public.check_min_rights("right", "userid", org_id, "appid", NULL::bigint);
  END IF;

  IF NOT allowed THEN
    PERFORM public.pg_log('deny: HAS_APP_RIGHT_APIKEY', jsonb_build_object('appid', "appid", 'org_id', org_id, 'right', "right"::text, 'userid', "userid", 'rbac', use_rbac));
  END IF;
  RETURN allowed;
END;
$$;

-- Ensure super_admin invites require super_admin role even in RBAC mode
CREATE OR REPLACE FUNCTION public.invite_user_to_org(
  "email" character varying,
  "org_id" uuid,
  "invite_type" public.user_min_right
) RETURNS character varying
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  org record;
  invited_user record;
  current_record record;
  current_tmp_user record;
  calling_user_id uuid;
  v_is_super_admin boolean := false;
  v_use_rbac boolean := false;
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
    v_use_rbac := public.rbac_is_enabled_for_org(invite_user_to_org.org_id);

    IF v_use_rbac THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.role_bindings rb
        JOIN public.roles r ON r.id = rb.role_id
        WHERE rb.principal_type = public.rbac_principal_user()
          AND rb.principal_id = calling_user_id
          AND (
            (rb.scope_type = public.rbac_scope_org()
              AND rb.org_id = invite_user_to_org.org_id
              AND r.name = public.rbac_role_org_super_admin())
            OR
            (rb.scope_type = public.rbac_scope_platform()
              AND r.name = public.rbac_role_platform_super_admin())
          )
      ) INTO v_is_super_admin;

      IF NOT v_is_super_admin THEN
        PERFORM public.pg_log('deny: NO_RIGHTS_SUPER_ADMIN', jsonb_build_object('org_id', invite_user_to_org.org_id, 'invite_type', invite_user_to_org.invite_type));
        RETURN 'NO_RIGHTS';
      END IF;
    ELSE
      IF NOT public.check_min_rights(public.rbac_right_super_admin()::public.user_min_right, calling_user_id, invite_user_to_org.org_id, NULL::varchar, NULL::bigint) THEN
        PERFORM public.pg_log('deny: NO_RIGHTS_SUPER_ADMIN', jsonb_build_object('org_id', invite_user_to_org.org_id, 'invite_type', invite_user_to_org.invite_type));
        RETURN 'NO_RIGHTS';
      END IF;
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

-- Fix apps table INSERT RLS policy to check org-level permissions
-- Original bug: checked app-level permissions but app_id doesn't exist during INSERT
-- Solution: Check org-level 'write' permission which admins/super_admins have

DROP POLICY IF EXISTS "Allow insert for apikey (write,all) (admin+)" ON "public"."apps";

CREATE POLICY "Allow insert for apikey (write,all) (admin+)" ON "public"."apps"
FOR INSERT TO "anon", "authenticated"
WITH CHECK (
  "public"."check_min_rights" (
    'write'::"public"."user_min_right",
    "public"."get_identity_org_allowed" (
      '{write,all}'::"public"."key_mode" [],
      "owner_org"
    ),
    "owner_org",
    NULL::character varying,  -- NULL for org-level check
    NULL::bigint
  )
);
