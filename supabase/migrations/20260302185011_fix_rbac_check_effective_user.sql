-- Fix rbac_check_permission_direct: use v_effective_user_id instead of p_user_id
-- in the RBAC path. When called via API key auth (auth.uid() = NULL), the function
-- resolves the user from the API key into v_effective_user_id, but the RBAC path
-- was still checking p_user_id (the original NULL parameter), causing permission
-- checks to be skipped entirely for API key authenticated requests.
--
-- The _no_password_policy variant already uses v_effective_user_id correctly.

CREATE OR REPLACE FUNCTION "public"."rbac_check_permission_direct"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_allowed boolean := false;
  v_use_rbac boolean;
  v_effective_org_id uuid := p_org_id;
  v_effective_user_id uuid := p_user_id;
  v_legacy_right public.user_min_right;
  v_apikey_principal uuid;
  v_override boolean;
  v_channel_scope boolean := false;
  v_org_enforcing_2fa boolean;
  v_password_policy_ok boolean;
BEGIN
  -- Validate permission key
  IF p_permission_key IS NULL OR p_permission_key = '' THEN
    PERFORM public.pg_log('deny: RBAC_CHECK_PERM_NO_KEY', jsonb_build_object('user_id', p_user_id));
    RETURN false;
  END IF;

  IF p_channel_id IS NOT NULL AND p_permission_key LIKE 'channel.%' THEN
    v_channel_scope := true;
  END IF;

  -- Derive org from app/channel when not provided
  IF v_effective_org_id IS NULL AND p_app_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id
    FROM public.apps
    WHERE app_id = p_app_id
    LIMIT 1;
  END IF;

  IF v_effective_org_id IS NULL AND p_channel_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id
    FROM public.channels
    WHERE id = p_channel_id
    LIMIT 1;
  END IF;

  -- Resolve user from API key when needed (handles hashed keys too).
  IF v_effective_user_id IS NULL AND p_apikey IS NOT NULL THEN
    SELECT user_id INTO v_effective_user_id
    FROM public.find_apikey_by_value(p_apikey)
    LIMIT 1;
  END IF;

  -- Enforce 2FA if the org requires it.
  IF v_effective_org_id IS NOT NULL THEN
    SELECT enforcing_2fa INTO v_org_enforcing_2fa
    FROM public.orgs
    WHERE id = v_effective_org_id;

    IF v_org_enforcing_2fa = true AND (v_effective_user_id IS NULL OR NOT public.has_2fa_enabled(v_effective_user_id)) THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_2FA_ENFORCEMENT', jsonb_build_object(
        'permission', p_permission_key,
        'org_id', v_effective_org_id,
        'app_id', p_app_id,
        'channel_id', p_channel_id,
        'user_id', v_effective_user_id,
        'has_apikey', p_apikey IS NOT NULL
      ));
      RETURN false;
    END IF;
  END IF;

  -- Enforce password policy if enabled for the org.
  IF v_effective_org_id IS NOT NULL THEN
    v_password_policy_ok := public.user_meets_password_policy(v_effective_user_id, v_effective_org_id);
    IF v_password_policy_ok = false THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_PASSWORD_POLICY_ENFORCEMENT', jsonb_build_object(
        'permission', p_permission_key,
        'org_id', v_effective_org_id,
        'app_id', p_app_id,
        'channel_id', p_channel_id,
        'user_id', v_effective_user_id,
        'has_apikey', p_apikey IS NOT NULL
      ));
      RETURN false;
    END IF;
  END IF;

  -- Check if RBAC is enabled for this org
  v_use_rbac := public.rbac_is_enabled_for_org(v_effective_org_id);

  IF v_use_rbac THEN
    -- RBAC path: Check user permission directly (use v_effective_user_id, NOT p_user_id)
    IF v_effective_user_id IS NOT NULL THEN
      v_allowed := public.rbac_has_permission(public.rbac_principal_user(), v_effective_user_id, p_permission_key, v_effective_org_id, p_app_id, p_channel_id);

      IF v_channel_scope THEN
        -- Direct user override
        SELECT o.is_allowed INTO v_override
        FROM public.channel_permission_overrides o
        WHERE o.principal_type = public.rbac_principal_user()
          AND o.principal_id = v_effective_user_id
          AND o.channel_id = p_channel_id
          AND o.permission_key = p_permission_key
        LIMIT 1;

        IF v_override IS NOT NULL THEN
          v_allowed := v_override;
        ELSE
          -- Group overrides (deny > allow)
          IF EXISTS (
            SELECT 1
            FROM public.channel_permission_overrides o
            JOIN public.group_members gm ON gm.group_id = o.principal_id AND gm.user_id = v_effective_user_id
            JOIN public.groups g ON g.id = gm.group_id
            WHERE o.principal_type = public.rbac_principal_group()
              AND o.channel_id = p_channel_id
              AND o.permission_key = p_permission_key
              AND o.is_allowed = false
              AND g.org_id = v_effective_org_id
          ) THEN
            v_allowed := false;
          ELSIF EXISTS (
            SELECT 1
            FROM public.channel_permission_overrides o
            JOIN public.group_members gm ON gm.group_id = o.principal_id AND gm.user_id = v_effective_user_id
            JOIN public.groups g ON g.id = gm.group_id
            WHERE o.principal_type = public.rbac_principal_group()
              AND o.channel_id = p_channel_id
              AND o.permission_key = p_permission_key
              AND o.is_allowed = true
              AND g.org_id = v_effective_org_id
          ) THEN
            v_allowed := true;
          END IF;
        END IF;
      END IF;
    END IF;

    -- If user doesn't have permission, check apikey permission
    IF NOT v_allowed AND p_apikey IS NOT NULL THEN
      SELECT rbac_id INTO v_apikey_principal
      FROM public.apikeys
      WHERE key = p_apikey
      LIMIT 1;

      IF v_apikey_principal IS NOT NULL THEN
        v_allowed := public.rbac_has_permission(public.rbac_principal_apikey(), v_apikey_principal, p_permission_key, v_effective_org_id, p_app_id, p_channel_id);

        IF v_channel_scope THEN
          SELECT o.is_allowed INTO v_override
          FROM public.channel_permission_overrides o
          WHERE o.principal_type = public.rbac_principal_apikey()
            AND o.principal_id = v_apikey_principal
            AND o.channel_id = p_channel_id
            AND o.permission_key = p_permission_key
          LIMIT 1;

          IF v_override IS NOT NULL THEN
            v_allowed := v_override;
          END IF;
        END IF;
      END IF;
    END IF;

    IF NOT v_allowed THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_DIRECT', jsonb_build_object(
        'permission', p_permission_key,
        'user_id', v_effective_user_id,
        'org_id', v_effective_org_id,
        'app_id', p_app_id,
        'channel_id', p_channel_id,
        'has_apikey', p_apikey IS NOT NULL
      ));
    END IF;

    RETURN v_allowed;
  ELSE
    -- Legacy path: Map permission to min_right and use legacy check
    v_legacy_right := public.rbac_legacy_right_for_permission(p_permission_key);

    IF v_legacy_right IS NULL THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_UNKNOWN_LEGACY', jsonb_build_object(
        'permission', p_permission_key,
        'user_id', p_user_id
      ));
      RETURN false;
    END IF;

    IF p_apikey IS NOT NULL AND p_app_id IS NOT NULL THEN
      RETURN public.has_app_right_apikey(p_app_id, v_legacy_right, p_user_id, p_apikey);
    ELSIF p_app_id IS NOT NULL THEN
      RETURN public.has_app_right_userid(p_app_id, v_legacy_right, p_user_id);
    ELSE
      RETURN public.check_min_rights_legacy(v_legacy_right, p_user_id, v_effective_org_id, p_app_id, p_channel_id);
    END IF;
  END IF;
END;
$$;

-- Fix invite_user_to_org_rbac: create role_binding directly after org_users insert.
-- The sync trigger (sync_org_user_to_role_binding_on_insert) intentionally skips
-- role_binding creation when use_new_rbac=true AND rbac_role_name IS NOT NULL,
-- expecting the caller to handle it. This function must create the binding itself.

CREATE OR REPLACE FUNCTION "public"."invite_user_to_org_rbac"("email" character varying, "org_id" "uuid", "role_name" "text") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org record;
  invited_user record;
  current_record record;
  current_tmp_user record;
  role_id uuid;
  legacy_right public.user_min_right;
  invite_right public.user_min_right;
  api_key_text text;
  v_granted_by uuid;
BEGIN
  SELECT * INTO org FROM public.orgs WHERE public.orgs.id = invite_user_to_org_rbac.org_id;
  IF org IS NULL THEN
    RETURN 'NO_ORG';
  END IF;

  IF NOT public.rbac_is_enabled_for_org(invite_user_to_org_rbac.org_id) THEN
    RETURN 'RBAC_NOT_ENABLED';
  END IF;

  SELECT id INTO role_id
  FROM public.roles r
  WHERE r.name = invite_user_to_org_rbac.role_name
    AND r.scope_type = public.rbac_scope_org()
    AND r.is_assignable = true
  LIMIT 1;

  IF role_id IS NULL THEN
    RETURN 'ROLE_NOT_FOUND';
  END IF;

  SELECT public.get_apikey_header() INTO api_key_text;

  IF invite_user_to_org_rbac.role_name = public.rbac_role_org_super_admin() THEN
    IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_update_user_roles(), auth.uid(), invite_user_to_org_rbac.org_id, NULL, NULL, api_key_text) THEN
      RETURN 'NO_RIGHTS';
    END IF;
  ELSE
    IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_invite_user(), auth.uid(), invite_user_to_org_rbac.org_id, NULL, NULL, api_key_text) THEN
      RETURN 'NO_RIGHTS';
    END IF;
  END IF;

  legacy_right := public.rbac_legacy_right_for_org_role(invite_user_to_org_rbac.role_name);
  invite_right := public.transform_role_to_invite(legacy_right);
  v_granted_by := COALESCE(auth.uid(), (SELECT user_id FROM public.find_apikey_by_value(api_key_text) LIMIT 1));

  SELECT public.users.id INTO invited_user FROM public.users WHERE public.users.email = invite_user_to_org_rbac.email;

  IF invited_user IS NOT NULL THEN
    SELECT public.org_users.id INTO current_record
    FROM public.org_users
    WHERE public.org_users.user_id = invited_user.id
      AND public.org_users.org_id = invite_user_to_org_rbac.org_id;

    IF current_record IS NOT NULL THEN
      RETURN 'ALREADY_INVITED';
    ELSE
      INSERT INTO public.org_users (user_id, org_id, user_right, rbac_role_name)
      VALUES (invited_user.id, invite_user_to_org_rbac.org_id, invite_right, invite_user_to_org_rbac.role_name);

      INSERT INTO public.role_bindings (
        principal_type, principal_id, role_id, scope_type, org_id,
        granted_by, granted_at, reason, is_direct
      ) VALUES (
        public.rbac_principal_user(), invited_user.id, role_id, public.rbac_scope_org(), invite_user_to_org_rbac.org_id,
        COALESCE(v_granted_by, invited_user.id), now(), 'Invited via invite_user_to_org_rbac', true
      ) ON CONFLICT DO NOTHING;

      RETURN 'OK';
    END IF;
  ELSE
    SELECT * INTO current_tmp_user
    FROM public.tmp_users
    WHERE public.tmp_users.email = invite_user_to_org_rbac.email
      AND public.tmp_users.org_id = invite_user_to_org_rbac.org_id;

    IF current_tmp_user IS NOT NULL THEN
      IF current_tmp_user.cancelled_at IS NOT NULL THEN
        IF current_tmp_user.cancelled_at > (CURRENT_TIMESTAMP - INTERVAL '3 hours') THEN
          RETURN 'TOO_RECENT_INVITATION_CANCELATION';
        ELSE
          RETURN 'NO_EMAIL';
        END IF;
      ELSE
        RETURN 'ALREADY_INVITED';
      END IF;
    ELSE
      RETURN 'NO_EMAIL';
    END IF;
  END IF;
END;
$$;
