-- Restore user-mismatch check and API key bindings-priority that were
-- overwritten by 20260424094101_enforce_apikey_scope_in_rbac_check.sql.
--
-- Main's migration rewrote rbac_check_permission_direct but lost two features
-- from 20260305120000_rbac_apikey_bindings_priority.sql:
--   1. User mismatch check: deny when the session user != API key owner.
--   2. Bindings priority: keys with explicit role_bindings use ONLY those
--      bindings (early return) so limited keys cannot exceed their grants.
--
-- This migration merges main's improvements (full row type, is_apikey_expired,
-- channel scope resolution, effective_app_id, no_password_policy variant) with
-- our branch's two features above.

-- =============================================================================
-- 1. rbac_check_permission_direct (with password policy)
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."rbac_check_permission_direct"(
  "p_permission_key" "text",
  "p_user_id" "uuid",
  "p_org_id" "uuid",
  "p_app_id" character varying,
  "p_channel_id" bigint,
  "p_apikey" "text" DEFAULT NULL::"text"
) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_allowed boolean := false;
  v_use_rbac boolean;
  v_effective_org_id uuid := p_org_id;
  v_effective_user_id uuid := p_user_id;
  v_effective_app_id character varying := p_app_id;
  v_legacy_right public.user_min_right;
  v_apikey_principal uuid;
  v_apikey_has_bindings boolean := false;
  v_override boolean;
  v_channel_scope boolean := false;
  v_org_enforcing_2fa boolean;
  v_password_policy_ok boolean;
  v_api_key public.apikeys%ROWTYPE;
  v_channel_org_id uuid;
  v_channel_app_id character varying;
BEGIN
  -- Validate permission key
  IF p_permission_key IS NULL OR p_permission_key = '' THEN
    PERFORM public.pg_log('deny: RBAC_CHECK_PERM_NO_KEY', jsonb_build_object('user_id', p_user_id));
    RETURN false;
  END IF;

  IF p_channel_id IS NOT NULL AND p_permission_key LIKE 'channel.%' THEN
    v_channel_scope := true;
  END IF;

  -- Resolve org from app when not provided
  IF v_effective_org_id IS NULL AND p_app_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id
    FROM public.apps
    WHERE app_id = p_app_id
    LIMIT 1;
  END IF;

  -- Resolve channel scope (overrides org/app if present)
  IF p_channel_id IS NOT NULL THEN
    SELECT owner_org, app_id
    INTO v_channel_org_id, v_channel_app_id
    FROM public.channels
    WHERE id = p_channel_id
    LIMIT 1;

    IF v_channel_org_id IS NOT NULL THEN
      v_effective_org_id := v_channel_org_id;
      v_effective_app_id := v_channel_app_id;
    END IF;
  END IF;

  -- ── API key resolution and validation ──
  IF p_apikey IS NOT NULL THEN
    SELECT * INTO v_api_key
    FROM public.find_apikey_by_value(p_apikey)
    LIMIT 1;

    IF v_api_key.id IS NULL THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_APIKEY_NOT_FOUND', jsonb_build_object(
        'permission', p_permission_key,
        'org_id', v_effective_org_id,
        'app_id', v_effective_app_id,
        'channel_id', p_channel_id
      ));
      RETURN false;
    END IF;

    IF public.is_apikey_expired(v_api_key.expires_at) THEN
      PERFORM public.pg_log('deny: API_KEY_EXPIRED', jsonb_build_object(
        'key_id', v_api_key.id,
        'org_id', v_effective_org_id,
        'app_id', v_effective_app_id,
        'channel_id', p_channel_id
      ));
      RETURN false;
    END IF;

    -- User mismatch check: the session user must own the API key.
    -- Without this, an attacker with broad user permissions could use
    -- another user's restricted key and still pass auth via their own roles.
    IF p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM v_api_key.user_id THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_APIKEY_USER_MISMATCH', jsonb_build_object(
        'permission', p_permission_key,
        'session_user_id', p_user_id,
        'apikey_user_id', v_api_key.user_id,
        'org_id', v_effective_org_id,
        'app_id', v_effective_app_id,
        'channel_id', p_channel_id
      ));
      RETURN false;
    END IF;

    -- Always use the API key owner as the effective user so that downstream
    -- permission checks resolve against the correct principal.
    v_effective_user_id := v_api_key.user_id;

    IF v_effective_org_id IS NULL THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_APIKEY_NO_ORG', jsonb_build_object(
        'permission', p_permission_key,
        'app_id', v_effective_app_id,
        'channel_id', p_channel_id,
        'key_id', v_api_key.id
      ));
      RETURN false;
    END IF;

    -- Org scope restriction
    IF COALESCE(array_length(v_api_key.limited_to_orgs, 1), 0) > 0
      AND NOT (v_effective_org_id = ANY(v_api_key.limited_to_orgs))
    THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_APIKEY_ORG_RESTRICT', jsonb_build_object(
        'permission', p_permission_key,
        'org_id', v_effective_org_id,
        'app_id', v_effective_app_id,
        'channel_id', p_channel_id,
        'key_id', v_api_key.id
      ));
      RETURN false;
    END IF;

    -- App scope restriction
    IF COALESCE(array_length(v_api_key.limited_to_apps, 1), 0) > 0 THEN
      IF v_effective_app_id IS NULL OR NOT (v_effective_app_id = ANY(v_api_key.limited_to_apps)) THEN
        PERFORM public.pg_log('deny: RBAC_CHECK_PERM_APIKEY_APP_RESTRICT', jsonb_build_object(
          'permission', p_permission_key,
          'org_id', v_effective_org_id,
          'app_id', v_effective_app_id,
          'channel_id', p_channel_id,
          'key_id', v_api_key.id
        ));
        RETURN false;
      END IF;
    END IF;
  END IF;

  -- ── 2FA enforcement ──
  IF v_effective_org_id IS NOT NULL THEN
    SELECT enforcing_2fa INTO v_org_enforcing_2fa
    FROM public.orgs
    WHERE id = v_effective_org_id;

    IF v_org_enforcing_2fa = true AND (v_effective_user_id IS NULL OR NOT public.has_2fa_enabled(v_effective_user_id)) THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_2FA_ENFORCEMENT', jsonb_build_object(
        'permission', p_permission_key,
        'org_id', v_effective_org_id,
        'app_id', v_effective_app_id,
        'channel_id', p_channel_id,
        'user_id', v_effective_user_id,
        'has_apikey', p_apikey IS NOT NULL
      ));
      RETURN false;
    END IF;
  END IF;

  -- ── Password policy enforcement ──
  IF v_effective_org_id IS NOT NULL THEN
    v_password_policy_ok := public.user_meets_password_policy(v_effective_user_id, v_effective_org_id);
    IF v_password_policy_ok = false THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_PASSWORD_POLICY_ENFORCEMENT', jsonb_build_object(
        'permission', p_permission_key,
        'org_id', v_effective_org_id,
        'app_id', v_effective_app_id,
        'channel_id', p_channel_id,
        'user_id', v_effective_user_id,
        'has_apikey', p_apikey IS NOT NULL
      ));
      RETURN false;
    END IF;
  END IF;

  -- ── RBAC vs legacy dispatch ──
  v_use_rbac := public.rbac_is_enabled_for_org(v_effective_org_id);

  IF v_use_rbac THEN
    -- ── Bindings priority: API keys with explicit role_bindings use ONLY
    -- those bindings (user permissions are ignored). This guarantees a
    -- limited key cannot exceed its explicitly granted permission set. ──
    IF v_api_key.id IS NOT NULL THEN
      v_apikey_principal := v_api_key.rbac_id;

      IF v_apikey_principal IS NOT NULL THEN
        SELECT EXISTS(
          SELECT 1 FROM public.role_bindings
          WHERE principal_type = public.rbac_principal_apikey()
            AND principal_id = v_apikey_principal
        ) INTO v_apikey_has_bindings;

        IF v_apikey_has_bindings THEN
          -- Key has explicit bindings: ONLY check those (owner user perms ignored).
          v_allowed := public.rbac_has_permission(
            public.rbac_principal_apikey(), v_apikey_principal,
            p_permission_key, v_effective_org_id, v_effective_app_id, p_channel_id
          );

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

          IF NOT v_allowed THEN
            PERFORM public.pg_log('deny: RBAC_CHECK_PERM_DIRECT', jsonb_build_object(
              'permission', p_permission_key,
              'user_id', v_effective_user_id,
              'org_id', v_effective_org_id,
              'app_id', v_effective_app_id,
              'channel_id', p_channel_id,
              'has_apikey', true,
              'apikey_has_bindings', true
            ));
          END IF;

          -- Early return: bindings-only evaluation, user perms not consulted.
          RETURN v_allowed;
        END IF;
      END IF;
    END IF;

    -- ── User permission check (no apikey, or apikey without explicit bindings). ──
    IF v_effective_user_id IS NOT NULL THEN
      v_allowed := public.rbac_has_permission(
        public.rbac_principal_user(), v_effective_user_id,
        p_permission_key, v_effective_org_id, v_effective_app_id, p_channel_id
      );

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
          -- Group overrides (deny wins over allow)
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

    -- Fallback: apikey without explicit bindings may still carry role_bindings
    -- from group membership or other indirect paths.
    IF NOT v_allowed AND v_api_key.id IS NOT NULL THEN
      v_apikey_principal := v_api_key.rbac_id;

      IF v_apikey_principal IS NOT NULL THEN
        v_allowed := public.rbac_has_permission(
          public.rbac_principal_apikey(), v_apikey_principal,
          p_permission_key, v_effective_org_id, v_effective_app_id, p_channel_id
        );

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
        'app_id', v_effective_app_id,
        'channel_id', p_channel_id,
        'has_apikey', p_apikey IS NOT NULL
      ));
    END IF;

    RETURN v_allowed;

  ELSE
    -- ── Legacy path ──
    v_legacy_right := public.rbac_legacy_right_for_permission(p_permission_key);

    IF v_legacy_right IS NULL THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_UNKNOWN_LEGACY', jsonb_build_object(
        'permission', p_permission_key,
        'user_id', p_user_id
      ));
      RETURN false;
    END IF;

    IF p_apikey IS NOT NULL AND v_effective_app_id IS NOT NULL THEN
      RETURN public.has_app_right_apikey(v_effective_app_id, v_legacy_right, v_effective_user_id, p_apikey);
    ELSIF v_effective_app_id IS NOT NULL THEN
      RETURN public.has_app_right_userid(v_effective_app_id, v_legacy_right, v_effective_user_id);
    ELSE
      RETURN public.check_min_rights_legacy(v_legacy_right, v_effective_user_id, v_effective_org_id, v_effective_app_id, p_channel_id);
    END IF;
  END IF;
END;
$$;

ALTER FUNCTION "public"."rbac_check_permission_direct"("text", "uuid", "uuid", character varying, bigint, "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."rbac_check_permission_direct"("text", "uuid", "uuid", character varying, bigint, "text") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."rbac_check_permission_direct"("text", "uuid", "uuid", character varying, bigint, "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."rbac_check_permission_direct"("text", "uuid", "uuid", character varying, bigint, "text") TO "service_role";


-- =============================================================================
-- 2. rbac_check_permission_direct_no_password_policy (same fixes)
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."rbac_check_permission_direct_no_password_policy"(
  "p_permission_key" "text",
  "p_user_id" "uuid",
  "p_org_id" "uuid",
  "p_app_id" character varying,
  "p_channel_id" bigint,
  "p_apikey" "text" DEFAULT NULL::"text"
) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_allowed boolean := false;
  v_use_rbac boolean;
  v_effective_org_id uuid := p_org_id;
  v_effective_user_id uuid := p_user_id;
  v_effective_app_id character varying := p_app_id;
  v_legacy_right public.user_min_right;
  v_apikey_principal uuid;
  v_apikey_has_bindings boolean := false;
  v_org_enforcing_2fa boolean;
  v_api_key public.apikeys%ROWTYPE;
  v_channel_org_id uuid;
  v_channel_app_id character varying;
BEGIN
  -- Validate permission key
  IF p_permission_key IS NULL OR p_permission_key = '' THEN
    PERFORM public.pg_log('deny: RBAC_CHECK_PERM_NO_KEY', jsonb_build_object('user_id', p_user_id));
    RETURN false;
  END IF;

  -- Resolve org from app when not provided
  IF v_effective_org_id IS NULL AND p_app_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id
    FROM public.apps
    WHERE app_id = p_app_id
    LIMIT 1;
  END IF;

  -- Resolve channel scope (overrides org/app if present)
  IF p_channel_id IS NOT NULL THEN
    SELECT owner_org, app_id
    INTO v_channel_org_id, v_channel_app_id
    FROM public.channels
    WHERE id = p_channel_id
    LIMIT 1;

    IF v_channel_org_id IS NOT NULL THEN
      v_effective_org_id := v_channel_org_id;
      v_effective_app_id := v_channel_app_id;
    END IF;
  END IF;

  -- ── API key resolution and validation ──
  IF p_apikey IS NOT NULL THEN
    SELECT * INTO v_api_key
    FROM public.find_apikey_by_value(p_apikey)
    LIMIT 1;

    IF v_api_key.id IS NULL THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_APIKEY_NOT_FOUND', jsonb_build_object(
        'permission', p_permission_key,
        'org_id', v_effective_org_id,
        'app_id', v_effective_app_id,
        'channel_id', p_channel_id
      ));
      RETURN false;
    END IF;

    IF public.is_apikey_expired(v_api_key.expires_at) THEN
      PERFORM public.pg_log('deny: API_KEY_EXPIRED', jsonb_build_object(
        'key_id', v_api_key.id,
        'org_id', v_effective_org_id,
        'app_id', v_effective_app_id,
        'channel_id', p_channel_id
      ));
      RETURN false;
    END IF;

    -- User mismatch check
    IF p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM v_api_key.user_id THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_APIKEY_USER_MISMATCH', jsonb_build_object(
        'permission', p_permission_key,
        'session_user_id', p_user_id,
        'apikey_user_id', v_api_key.user_id,
        'org_id', v_effective_org_id,
        'app_id', v_effective_app_id,
        'channel_id', p_channel_id
      ));
      RETURN false;
    END IF;

    v_effective_user_id := v_api_key.user_id;

    IF v_effective_org_id IS NULL THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_APIKEY_NO_ORG', jsonb_build_object(
        'permission', p_permission_key,
        'app_id', v_effective_app_id,
        'channel_id', p_channel_id,
        'key_id', v_api_key.id
      ));
      RETURN false;
    END IF;

    IF COALESCE(array_length(v_api_key.limited_to_orgs, 1), 0) > 0
      AND NOT (v_effective_org_id = ANY(v_api_key.limited_to_orgs))
    THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_APIKEY_ORG_RESTRICT', jsonb_build_object(
        'permission', p_permission_key,
        'org_id', v_effective_org_id,
        'app_id', v_effective_app_id,
        'channel_id', p_channel_id,
        'key_id', v_api_key.id
      ));
      RETURN false;
    END IF;

    IF COALESCE(array_length(v_api_key.limited_to_apps, 1), 0) > 0 THEN
      IF v_effective_app_id IS NULL OR NOT (v_effective_app_id = ANY(v_api_key.limited_to_apps)) THEN
        PERFORM public.pg_log('deny: RBAC_CHECK_PERM_APIKEY_APP_RESTRICT', jsonb_build_object(
          'permission', p_permission_key,
          'org_id', v_effective_org_id,
          'app_id', v_effective_app_id,
          'channel_id', p_channel_id,
          'key_id', v_api_key.id
        ));
        RETURN false;
      END IF;
    END IF;
  END IF;

  -- ── 2FA enforcement ──
  IF v_effective_org_id IS NOT NULL THEN
    SELECT enforcing_2fa INTO v_org_enforcing_2fa
    FROM public.orgs
    WHERE id = v_effective_org_id;

    IF v_org_enforcing_2fa = true AND (v_effective_user_id IS NULL OR NOT public.has_2fa_enabled(v_effective_user_id)) THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_2FA_ENFORCEMENT', jsonb_build_object(
        'permission', p_permission_key,
        'org_id', v_effective_org_id,
        'app_id', v_effective_app_id,
        'channel_id', p_channel_id,
        'user_id', v_effective_user_id,
        'has_apikey', p_apikey IS NOT NULL
      ));
      RETURN false;
    END IF;
  END IF;

  -- (no password policy check in this variant)

  -- ── RBAC vs legacy dispatch ──
  v_use_rbac := public.rbac_is_enabled_for_org(v_effective_org_id);

  IF v_use_rbac THEN
    -- Bindings priority: keys with explicit role_bindings use ONLY those.
    IF v_api_key.id IS NOT NULL THEN
      v_apikey_principal := v_api_key.rbac_id;

      IF v_apikey_principal IS NOT NULL THEN
        SELECT EXISTS(
          SELECT 1 FROM public.role_bindings
          WHERE principal_type = public.rbac_principal_apikey()
            AND principal_id = v_apikey_principal
        ) INTO v_apikey_has_bindings;

        IF v_apikey_has_bindings THEN
          v_allowed := public.rbac_has_permission(
            public.rbac_principal_apikey(), v_apikey_principal,
            p_permission_key, v_effective_org_id, v_effective_app_id, p_channel_id
          );

          IF NOT v_allowed THEN
            PERFORM public.pg_log('deny: RBAC_CHECK_PERM_DIRECT', jsonb_build_object(
              'permission', p_permission_key,
              'user_id', v_effective_user_id,
              'org_id', v_effective_org_id,
              'app_id', v_effective_app_id,
              'channel_id', p_channel_id,
              'has_apikey', true,
              'apikey_has_bindings', true
            ));
          END IF;

          RETURN v_allowed;
        END IF;
      END IF;
    END IF;

    -- User permission check
    IF v_effective_user_id IS NOT NULL THEN
      v_allowed := public.rbac_has_permission(
        public.rbac_principal_user(), v_effective_user_id,
        p_permission_key, v_effective_org_id, v_effective_app_id, p_channel_id
      );
    END IF;

    -- Fallback: apikey without explicit bindings
    IF NOT v_allowed AND v_api_key.id IS NOT NULL THEN
      v_apikey_principal := v_api_key.rbac_id;

      IF v_apikey_principal IS NOT NULL THEN
        v_allowed := public.rbac_has_permission(
          public.rbac_principal_apikey(), v_apikey_principal,
          p_permission_key, v_effective_org_id, v_effective_app_id, p_channel_id
        );
      END IF;
    END IF;

    IF NOT v_allowed THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_DIRECT', jsonb_build_object(
        'permission', p_permission_key,
        'user_id', v_effective_user_id,
        'org_id', v_effective_org_id,
        'app_id', v_effective_app_id,
        'channel_id', p_channel_id,
        'has_apikey', p_apikey IS NOT NULL
      ));
    END IF;

    RETURN v_allowed;

  ELSE
    -- Legacy path
    v_legacy_right := public.rbac_legacy_right_for_permission(p_permission_key);

    IF v_legacy_right IS NULL THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_UNKNOWN_LEGACY', jsonb_build_object(
        'permission', p_permission_key,
        'user_id', v_effective_user_id
      ));
      RETURN false;
    END IF;

    IF p_apikey IS NOT NULL AND v_effective_app_id IS NOT NULL THEN
      RETURN public.has_app_right_apikey(v_effective_app_id, v_legacy_right, v_effective_user_id, p_apikey);
    ELSIF v_effective_app_id IS NOT NULL THEN
      RETURN public.has_app_right_userid(v_effective_app_id, v_legacy_right, v_effective_user_id);
    ELSE
      RETURN public.check_min_rights_legacy_no_password_policy(v_legacy_right, v_effective_user_id, v_effective_org_id, v_effective_app_id, p_channel_id);
    END IF;
  END IF;
END;
$$;

ALTER FUNCTION "public"."rbac_check_permission_direct_no_password_policy"("text", "uuid", "uuid", character varying, bigint, "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."rbac_check_permission_direct_no_password_policy"("text", "uuid", "uuid", character varying, bigint, "text") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."rbac_check_permission_direct_no_password_policy"("text", "uuid", "uuid", character varying, bigint, "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."rbac_check_permission_direct_no_password_policy"("text", "uuid", "uuid", character varying, bigint, "text") TO "service_role";
