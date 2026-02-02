-- Allow org.read checks without enforcing password policy for password verification flow

CREATE OR REPLACE FUNCTION public.check_min_rights_legacy_no_password_policy(
  min_right public.user_min_right,
  user_id uuid,
  org_id uuid,
  app_id character varying,
  channel_id bigint
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  user_right_record RECORD;
  v_org_enforcing_2fa boolean;
BEGIN
  IF user_id IS NULL THEN
    PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_LEGACY_NO_UID', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text));
    RETURN false;
  END IF;

  -- Enforce 2FA if the org requires it.
  IF org_id IS NOT NULL THEN
    SELECT enforcing_2fa INTO v_org_enforcing_2fa FROM public.orgs WHERE id = org_id;
    IF v_org_enforcing_2fa = true AND NOT public.has_2fa_enabled(user_id) THEN
      PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_LEGACY_NO_PW_2FA_ENFORCEMENT', jsonb_build_object(
        'org_id', org_id,
        'app_id', app_id,
        'channel_id', channel_id,
        'min_right', min_right::text,
        'user_id', user_id
      ));
      RETURN false;
    END IF;
  END IF;

  FOR user_right_record IN
    SELECT org_users.user_right, org_users.app_id, org_users.channel_id
    FROM public.org_users
    WHERE org_users.org_id = check_min_rights_legacy_no_password_policy.org_id
      AND org_users.user_id = check_min_rights_legacy_no_password_policy.user_id
  LOOP
    IF (user_right_record.user_right >= min_right AND user_right_record.app_id IS NULL AND user_right_record.channel_id IS NULL) OR
       (user_right_record.user_right >= min_right AND user_right_record.app_id = check_min_rights_legacy_no_password_policy.app_id AND user_right_record.channel_id IS NULL) OR
       (user_right_record.user_right >= min_right AND user_right_record.app_id = check_min_rights_legacy_no_password_policy.app_id AND user_right_record.channel_id = check_min_rights_legacy_no_password_policy.channel_id)
    THEN
      RETURN true;
    END IF;
  END LOOP;

  PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_LEGACY_NO_PW', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text, 'user_id', user_id));
  RETURN false;
END;
$$;

ALTER FUNCTION public.check_min_rights_legacy_no_password_policy(public.user_min_right, uuid, uuid, character varying, bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.check_min_rights_legacy_no_password_policy(public.user_min_right, uuid, uuid, character varying, bigint) FROM public;
REVOKE ALL ON FUNCTION public.check_min_rights_legacy_no_password_policy(public.user_min_right, uuid, uuid, character varying, bigint) FROM anon;
REVOKE ALL ON FUNCTION public.check_min_rights_legacy_no_password_policy(public.user_min_right, uuid, uuid, character varying, bigint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_min_rights_legacy_no_password_policy(public.user_min_right, uuid, uuid, character varying, bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.rbac_check_permission_direct_no_password_policy(
  p_permission_key text,
  p_user_id uuid,
  p_org_id uuid,
  p_app_id character varying,
  p_channel_id bigint,
  p_apikey text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_allowed boolean := false;
  v_use_rbac boolean;
  v_effective_org_id uuid := p_org_id;
  v_legacy_right public.user_min_right;
  v_apikey_principal uuid;
  v_org_enforcing_2fa boolean;
  v_effective_user_id uuid := p_user_id;
BEGIN
  -- Validate permission key
  IF p_permission_key IS NULL OR p_permission_key = '' THEN
    PERFORM public.pg_log('deny: RBAC_CHECK_PERM_NO_KEY', jsonb_build_object('user_id', p_user_id));
    RETURN false;
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

  -- Check if RBAC is enabled for this org
  v_use_rbac := public.rbac_is_enabled_for_org(v_effective_org_id);

  IF v_use_rbac THEN
    -- RBAC path: Check user permission directly
    IF v_effective_user_id IS NOT NULL THEN
      v_allowed := public.rbac_has_permission(public.rbac_principal_user(), v_effective_user_id, p_permission_key, v_effective_org_id, p_app_id, p_channel_id);
    END IF;

    -- If user doesn't have permission, check apikey permission
    IF NOT v_allowed AND p_apikey IS NOT NULL THEN
      SELECT rbac_id INTO v_apikey_principal
      FROM public.apikeys
      WHERE key = p_apikey
      LIMIT 1;

      IF v_apikey_principal IS NOT NULL THEN
        v_allowed := public.rbac_has_permission(public.rbac_principal_apikey(), v_apikey_principal, p_permission_key, v_effective_org_id, p_app_id, p_channel_id);
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
      -- Unknown permission in legacy mode, deny by default
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_UNKNOWN_LEGACY', jsonb_build_object(
        'permission', p_permission_key,
        'user_id', v_effective_user_id
      ));
      RETURN false;
    END IF;

    -- Use appropriate legacy check based on context
    IF p_apikey IS NOT NULL AND p_app_id IS NOT NULL THEN
      RETURN public.has_app_right_apikey(p_app_id, v_legacy_right, v_effective_user_id, p_apikey);
    ELSIF p_app_id IS NOT NULL THEN
      RETURN public.has_app_right_userid(p_app_id, v_legacy_right, v_effective_user_id);
    ELSE
      RETURN public.check_min_rights_legacy_no_password_policy(v_legacy_right, v_effective_user_id, v_effective_org_id, p_app_id, p_channel_id);
    END IF;
  END IF;
END;
$$;

ALTER FUNCTION public.rbac_check_permission_direct_no_password_policy(text, uuid, uuid, character varying, bigint, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rbac_check_permission_direct_no_password_policy(text, uuid, uuid, character varying, bigint, text) FROM public;
REVOKE ALL ON FUNCTION public.rbac_check_permission_direct_no_password_policy(text, uuid, uuid, character varying, bigint, text) FROM anon;
REVOKE ALL ON FUNCTION public.rbac_check_permission_direct_no_password_policy(text, uuid, uuid, character varying, bigint, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_check_permission_direct_no_password_policy(text, uuid, uuid, character varying, bigint, text) TO service_role;

CREATE OR REPLACE FUNCTION public.rbac_check_permission_no_password_policy(
  p_permission_key text,
  p_org_id uuid DEFAULT NULL,
  p_app_id character varying DEFAULT NULL,
  p_channel_id bigint DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.rbac_check_permission_direct_no_password_policy(
    p_permission_key,
    auth.uid(),
    p_org_id,
    p_app_id,
    p_channel_id,
    NULL
  );
END;
$$;

COMMENT ON FUNCTION public.rbac_check_permission_no_password_policy(text, uuid, character varying, bigint) IS
  'RBAC permission check without password policy enforcement. Uses auth.uid() and delegates to rbac_check_permission_direct_no_password_policy.';

ALTER FUNCTION public.rbac_check_permission_no_password_policy(text, uuid, character varying, bigint) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.rbac_check_permission_no_password_policy(text, uuid, character varying, bigint) TO authenticated;
