-- API Key RBAC Priority
--
-- Changes to rbac_check_permission_direct (RBAC path):
--   OLD: check user permissions first, fall back to apikey bindings
--   NEW: if the API key has explicit role_bindings → use ONLY those (user perms ignored,
--        ensuring limited keys are truly limited). If no bindings → enforce
--        limited_to_orgs/limited_to_apps scope, then fall back to user perms.
--
-- New function get_org_perm_for_apikey_v2: RBAC-aware version of get_org_perm_for_apikey.
--   Routes to legacy function for non-RBAC orgs; uses rbac_check_permission_direct
--   for RBAC orgs to return the correct perm_* level.
--
-- New function get_org_apikeys: SECURITY DEFINER RPC for frontend to list all API keys
--   relevant to an org (owner is an org member, key scope matches org).

-- =============================================================================
-- 1. Update rbac_check_permission_direct
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
  c_empty_text constant text := '';
  c_permission_key constant text := 'permission';
  c_org_id_key constant text := 'org_id';
  c_app_id_key constant text := 'app_id';
  c_channel_id_key constant text := 'channel_id';
  c_user_id_key constant text := 'user_id';
  c_has_apikey_key constant text := 'has_apikey';
  v_allowed boolean := false;
  v_use_rbac boolean;
  v_effective_org_id uuid := p_org_id;
  v_effective_user_id uuid := p_user_id;
  v_legacy_right public.user_min_right;
  v_apikey_user_id uuid;
  v_apikey_principal uuid;
  v_apikey_has_bindings boolean := false;
  v_api_limited_orgs uuid[];
  v_api_limited_apps varchar[];
  v_override boolean;
  v_channel_scope boolean := false;
  v_org_enforcing_2fa boolean;
  v_password_policy_ok boolean;
BEGIN
  -- Validate permission key
  IF p_permission_key IS NULL OR p_permission_key = c_empty_text THEN
    PERFORM public.pg_log('deny: RBAC_CHECK_PERM_NO_KEY', jsonb_build_object(c_user_id_key, p_user_id));
    RETURN false;
  END IF;

  IF p_channel_id IS NOT NULL AND p_permission_key LIKE 'channel.%' THEN
    v_channel_scope := true;
  END IF;

  -- Resolve API key first (handles hashed keys too) so it cannot be bypassed by p_user_id.
  IF p_apikey IS NOT NULL THEN
    SELECT user_id, rbac_id, limited_to_orgs, limited_to_apps
    INTO v_apikey_user_id, v_apikey_principal, v_api_limited_orgs, v_api_limited_apps
    FROM public.find_apikey_by_value(p_apikey)
    LIMIT 1;

    IF v_apikey_user_id IS NULL THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_INVALID_APIKEY', jsonb_build_object(
        c_permission_key, p_permission_key,
        c_org_id_key, v_effective_org_id,
        c_app_id_key, p_app_id,
        c_channel_id_key, p_channel_id
      ));
      RETURN false;
    END IF;

    IF p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM v_apikey_user_id THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_APIKEY_USER_MISMATCH', jsonb_build_object(
        c_permission_key, p_permission_key,
        'session_user_id', p_user_id,
        'apikey_user_id', v_apikey_user_id,
        c_org_id_key, v_effective_org_id,
        c_app_id_key, p_app_id,
        c_channel_id_key, p_channel_id
      ));
      RETURN false;
    END IF;

    v_effective_user_id := v_apikey_user_id;
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

  -- Enforce 2FA if the org requires it.
  IF v_effective_org_id IS NOT NULL THEN
    SELECT enforcing_2fa INTO v_org_enforcing_2fa
    FROM public.orgs
    WHERE id = v_effective_org_id;

    IF v_org_enforcing_2fa = true AND (v_effective_user_id IS NULL OR NOT public.has_2fa_enabled(v_effective_user_id)) THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_2FA_ENFORCEMENT', jsonb_build_object(
        c_permission_key, p_permission_key,
        c_org_id_key, v_effective_org_id,
        c_app_id_key, p_app_id,
        c_channel_id_key, p_channel_id,
        c_user_id_key, v_effective_user_id,
        c_has_apikey_key, p_apikey IS NOT NULL
      ));
      RETURN false;
    END IF;
  END IF;

  -- Enforce password policy if enabled for the org.
  IF v_effective_org_id IS NOT NULL THEN
    v_password_policy_ok := public.user_meets_password_policy(v_effective_user_id, v_effective_org_id);
    IF v_password_policy_ok = false THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_PASSWORD_POLICY_ENFORCEMENT', jsonb_build_object(
        c_permission_key, p_permission_key,
        c_org_id_key, v_effective_org_id,
        c_app_id_key, p_app_id,
        c_channel_id_key, p_channel_id,
        c_user_id_key, v_effective_user_id,
        c_has_apikey_key, p_apikey IS NOT NULL
      ));
      RETURN false;
    END IF;
  END IF;

  -- Check if RBAC is enabled for this org
  v_use_rbac := public.rbac_is_enabled_for_org(v_effective_org_id);

  IF v_use_rbac THEN
    -- API key principal was resolved early so it cannot be bypassed by p_user_id.
    IF p_apikey IS NOT NULL THEN
      IF v_apikey_principal IS NOT NULL THEN
        -- Does this key have any explicit RBAC role bindings?
        SELECT EXISTS(
          SELECT 1 FROM public.role_bindings
          WHERE principal_type = public.rbac_principal_apikey()
            AND principal_id = v_apikey_principal
        ) INTO v_apikey_has_bindings;

        IF v_apikey_has_bindings THEN
          -- Key has explicit bindings: ONLY check those (owner's user perms are ignored).
          -- This ensures a limited key cannot exceed its explicitly granted permissions.
          v_allowed := public.rbac_has_permission(
            public.rbac_principal_apikey(), v_apikey_principal,
            p_permission_key, v_effective_org_id, p_app_id, p_channel_id
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
              c_permission_key, p_permission_key,
              c_user_id_key, v_effective_user_id,
              c_org_id_key, v_effective_org_id,
              c_app_id_key, p_app_id,
              c_channel_id_key, p_channel_id,
              c_has_apikey_key, true,
              'apikey_has_bindings', true
            ));
          END IF;

          RETURN v_allowed;

        ELSE
          -- No explicit bindings: enforce limited_to_orgs / limited_to_apps scope
          -- before falling through to the owner's user permissions.
          -- Enforce org scope restriction
          IF v_effective_org_id IS NOT NULL
            AND v_api_limited_orgs IS NOT NULL
            AND cardinality(v_api_limited_orgs) > 0
            AND NOT (v_effective_org_id = ANY(v_api_limited_orgs)) THEN
            PERFORM public.pg_log('deny: RBAC_CHECK_PERM_APIKEY_ORG_SCOPE', jsonb_build_object(
              c_permission_key, p_permission_key,
              'apikey_rbac_id', v_apikey_principal,
              c_org_id_key, v_effective_org_id
            ));
            RETURN false;
          END IF;

          -- Enforce app scope restriction
          IF p_app_id IS NOT NULL
            AND v_api_limited_apps IS NOT NULL
            AND cardinality(v_api_limited_apps) > 0
            AND NOT (p_app_id = ANY(v_api_limited_apps)) THEN
            PERFORM public.pg_log('deny: RBAC_CHECK_PERM_APIKEY_APP_SCOPE', jsonb_build_object(
              c_permission_key, p_permission_key,
              'apikey_rbac_id', v_apikey_principal,
              c_app_id_key, p_app_id
            ));
            RETURN false;
          END IF;

          -- Scope OK — fall through to owner's user permission check below.
        END IF;
      END IF;
    END IF;

    -- User permission check (owner fallback or no API key in request).
    IF v_effective_user_id IS NOT NULL THEN
      v_allowed := public.rbac_has_permission(
        public.rbac_principal_user(), v_effective_user_id,
        p_permission_key, v_effective_org_id, p_app_id, p_channel_id
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

    IF NOT v_allowed THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_DIRECT', jsonb_build_object(
        c_permission_key, p_permission_key,
        c_user_id_key, v_effective_user_id,
        c_org_id_key, v_effective_org_id,
        c_app_id_key, p_app_id,
        c_channel_id_key, p_channel_id,
        c_has_apikey_key, p_apikey IS NOT NULL
      ));
    END IF;

    RETURN v_allowed;

  ELSE
    -- Legacy path: Map permission to min_right and use legacy check
    v_legacy_right := public.rbac_legacy_right_for_permission(p_permission_key);

    IF v_legacy_right IS NULL THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_UNKNOWN_LEGACY', jsonb_build_object(
        c_permission_key, p_permission_key,
        c_user_id_key, p_user_id
      ));
      RETURN false;
    END IF;

    IF p_apikey IS NOT NULL AND p_app_id IS NOT NULL THEN
      RETURN public.has_app_right_apikey(p_app_id, v_legacy_right, COALESCE(v_effective_user_id, p_user_id), p_apikey);
    ELSIF p_app_id IS NOT NULL THEN
      RETURN public.has_app_right_userid(p_app_id, v_legacy_right, p_user_id);
    ELSE
      RETURN public.check_min_rights_legacy(v_legacy_right, COALESCE(v_effective_user_id, p_user_id), v_effective_org_id, p_app_id, p_channel_id);
    END IF;
  END IF;
END;
$$;

-- =============================================================================
-- 2. get_org_perm_for_apikey_v2
--    RBAC-aware version of get_org_perm_for_apikey.
--    For RBAC-enabled orgs: determines the effective permission level by probing
--    rbac_check_permission_direct with characteristic permissions for each level.
--    For legacy orgs: delegates to the existing get_org_perm_for_apikey.
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."get_org_perm_for_apikey_v2"(
  "apikey" "text",
  "app_id" "text"
) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_use_rbac boolean;
BEGIN
  -- Resolve user from API key (supports hashed keys)
  SELECT user_id INTO v_user_id
  FROM public.find_apikey_by_value(get_org_perm_for_apikey_v2.apikey)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN 'INVALID_APIKEY';
  END IF;

  -- Resolve org from app
  SELECT owner_org INTO v_org_id
  FROM public.apps
  WHERE public.apps.app_id = get_org_perm_for_apikey_v2.app_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN 'NO_APP';
  END IF;

  -- Route to legacy function for non-RBAC orgs
  v_use_rbac := public.rbac_is_enabled_for_org(v_org_id);
  IF NOT v_use_rbac THEN
    RETURN public.get_org_perm_for_apikey(get_org_perm_for_apikey_v2.apikey, get_org_perm_for_apikey_v2.app_id);
  END IF;

  -- RBAC path: probe permissions from highest to lowest, return first match.
  -- rbac_check_permission_direct handles "key bindings take priority" logic internally.

  IF public.rbac_check_permission_direct(
    'org.delete', v_user_id, v_org_id, get_org_perm_for_apikey_v2.app_id::varchar, NULL,
    get_org_perm_for_apikey_v2.apikey
  ) THEN
    RETURN 'perm_owner';
  END IF;

  IF public.rbac_check_permission_direct(
    'app.delete', v_user_id, v_org_id, get_org_perm_for_apikey_v2.app_id::varchar, NULL,
    get_org_perm_for_apikey_v2.apikey
  ) THEN
    RETURN 'perm_admin';
  END IF;

  IF public.rbac_check_permission_direct(
    'app.create_channel', v_user_id, v_org_id, get_org_perm_for_apikey_v2.app_id::varchar, NULL,
    get_org_perm_for_apikey_v2.apikey
  ) THEN
    RETURN 'perm_write';
  END IF;

  IF public.rbac_check_permission_direct(
    'app.upload_bundle', v_user_id, v_org_id, get_org_perm_for_apikey_v2.app_id::varchar, NULL,
    get_org_perm_for_apikey_v2.apikey
  ) THEN
    RETURN 'perm_upload';
  END IF;

  IF public.rbac_check_permission_direct(
    'app.read', v_user_id, v_org_id, get_org_perm_for_apikey_v2.app_id::varchar, NULL,
    get_org_perm_for_apikey_v2.apikey
  ) THEN
    RETURN 'perm_read';
  END IF;

  RETURN 'perm_none';
END;
$$;

ALTER FUNCTION "public"."get_org_perm_for_apikey_v2"("apikey" "text", "app_id" "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_org_perm_for_apikey_v2"("apikey" "text", "app_id" "text") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."get_org_perm_for_apikey_v2"("apikey" "text", "app_id" "text") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."get_org_perm_for_apikey_v2"("apikey" "text", "app_id" "text") TO "service_role";

-- =============================================================================
-- 3. get_org_apikeys
--    Returns API keys relevant to an org for the RBAC management UI.
--    "Relevant" includes owner membership, org/app-scoped RBAC bindings, or
--    app/org limits that point to apps in this org.
--    key/key_hash are intentionally excluded (sensitive).
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."get_org_apikeys"(
  "p_org_id" "uuid"
) RETURNS TABLE (
  "id" bigint,
  "rbac_id" "uuid",
  "name" "text",
  "mode" "public"."key_mode",
  "limited_to_orgs" "uuid"[],
  "limited_to_apps" "varchar"[],
  "user_id" "uuid",
  "owner_email" character varying,
  "created_at" timestamptz,
  "expires_at" timestamptz
)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Permission check: caller must be allowed to manage org roles/API keys.
  IF NOT public.rbac_check_permission_direct(
    public.rbac_perm_org_update_user_roles(),
    auth.uid(),
    p_org_id,
    NULL::varchar,
    NULL::bigint,
    public.get_apikey_header()
  ) THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  RETURN QUERY
    SELECT
      ak.id,
      ak.rbac_id,
      ak.name::text,
      ak.mode,
      ak.limited_to_orgs,
      ak.limited_to_apps,
      ak.user_id,
      u.email,
      ak.created_at,
      ak.expires_at
    FROM public.apikeys ak
    INNER JOIN public.users u
      ON u.id = ak.user_id
    WHERE
      (
        EXISTS (
          SELECT 1
          FROM public.org_users ou
          WHERE ou.user_id = ak.user_id
            AND ou.org_id = p_org_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.role_bindings rb
          WHERE rb.principal_type = public.rbac_principal_user()
            AND rb.scope_type = public.rbac_scope_org()
            AND rb.principal_id = ak.user_id
            AND rb.org_id = p_org_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.role_bindings rb
          WHERE rb.principal_type = public.rbac_principal_apikey()
            AND rb.scope_type = public.rbac_scope_org()
            AND rb.principal_id = ak.rbac_id
            AND rb.org_id = p_org_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.role_bindings rb
          INNER JOIN public.apps a
            ON a.id = rb.app_id
           AND a.owner_org = p_org_id
          WHERE rb.principal_type = public.rbac_principal_apikey()
            AND rb.scope_type = public.rbac_scope_app()
            AND rb.principal_id = ak.rbac_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.apps a
          WHERE a.owner_org = p_org_id
            AND ak.limited_to_apps IS NOT NULL
            AND a.app_id = ANY(ak.limited_to_apps)
        )
      )
      -- Key scope: either unlimited (no org restriction) or includes this org
      AND (ak.limited_to_orgs IS NULL OR cardinality(ak.limited_to_orgs) = 0 OR p_org_id = ANY(ak.limited_to_orgs))
      -- Exclude expired keys
      AND (ak.expires_at IS NULL OR ak.expires_at > now())
    ORDER BY ak.created_at DESC;
END;
$$;

ALTER FUNCTION "public"."get_org_apikeys"("p_org_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_org_apikeys"("p_org_id" "uuid") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."get_org_apikeys"("p_org_id" "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."get_org_apikeys"("p_org_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_org_apikeys"("p_org_id" "uuid") TO "service_role";
