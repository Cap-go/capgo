-- Phase 3: Service-Principal support in check_min_rights functions
--
-- When an API key is provisioned as a service principal, the edge-function
-- middleware creates an auth.users entry (id = rbac_id) and signs a JWT with
-- sub = rbac_id. When that JWT is used for DB queries, auth.uid() returns
-- rbac_id — meaning the "user_id" parameter received by check_min_rights IS
-- the service principal's UUID, not a human user.
--
-- Problems solved by this migration:
--   1. 2FA enforcement was blocking service principals (API keys can't have 2FA).
--   2. Password policy enforcement was blocking service principals (no password).
--   3. When auth.uid() = rbac_id and there is no capgkey header, the existing
--      apikey RBAC fallback didn't run (get_apikey_header() returns NULL for
--      JWT requests). Service principals need their own fallback path.
--
-- Changes:
--   - Add is_service_principal(uuid) helper.
--   - Update check_min_rights: skip 2FA/password enforcement for SPs, add SP
--     JWT fallback in RBAC path.
--   - Update check_min_rights_legacy: same 2FA/password exemptions, add SP
--     fallback that maps key_mode → user_min_right for the legacy org_users check.
--   - Update check_min_rights_legacy_no_password_policy: same 2FA exemption and
--     SP fallback (password policy already absent in this variant).

-- ============================================================================
-- 1. is_service_principal(p uuid) RETURNS boolean
--    Returns true when the given UUID is the rbac_id of a provisioned service
--    principal API key. Used as a guard before blocking SPs on 2FA / password.
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."is_service_principal"("p" "uuid")
RETURNS boolean
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."apikeys"
    WHERE "rbac_id" = p
      AND "service_principal_provisioned" = true
  )
$$;

ALTER FUNCTION "public"."is_service_principal"("p" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."is_service_principal"("p" "uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."is_service_principal"("p" "uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."is_service_principal"("p" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_service_principal"("p" "uuid") TO "anon";

COMMENT ON FUNCTION "public"."is_service_principal"("p" "uuid") IS
  'Returns true when the given UUID is the rbac_id of a provisioned service-principal '
  'API key (i.e. an auth.users entry exists with id=rbac_id). Used to exempt service '
  'principals from 2FA and password-policy enforcement inside permission checks.';

-- ============================================================================
-- 2. check_min_rights — RBAC path
--    Two changes vs. the previous version:
--      a) 2FA and password-policy blocks now skip the RETURN false for SPs.
--      b) After the capgkey fallback, a new service-principal JWT path looks up
--         the apikey by rbac_id = user_id when no capgkey header was present.
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."check_min_rights"(
  "min_right" "public"."user_min_right",
  "user_id" "uuid",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_allowed boolean := false;
  v_perm text;
  v_scope text;
  v_apikey text;
  v_apikey_principal uuid;
  v_use_rbac boolean;
  v_effective_org_id uuid := org_id;
  v_org_enforcing_2fa boolean;
  v_password_policy_ok boolean;
  api_key record;
  v_sp_apikey record;
BEGIN
  -- Derive org from app/channel when not provided to honor org-level flag and scoping.
  IF v_effective_org_id IS NULL AND app_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id FROM public.apps WHERE public.apps.app_id = check_min_rights.app_id LIMIT 1;
  END IF;
  IF v_effective_org_id IS NULL AND channel_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id FROM public.channels WHERE public.channels.id = channel_id LIMIT 1;
  END IF;

  -- Enforce 2FA if the org requires it.
  -- Service principals (API keys with a provisioned auth.users entry) are exempt
  -- because they cannot enroll in 2FA.
  IF v_effective_org_id IS NOT NULL THEN
    SELECT enforcing_2fa INTO v_org_enforcing_2fa FROM public.orgs WHERE id = v_effective_org_id;
    IF v_org_enforcing_2fa = true AND (user_id IS NULL OR NOT public.has_2fa_enabled(user_id)) THEN
      IF NOT public.is_service_principal(user_id) THEN
        PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_2FA_ENFORCEMENT', jsonb_build_object(
          'org_id', COALESCE(org_id, v_effective_org_id),
          'app_id', app_id,
          'channel_id', channel_id,
          'min_right', min_right::text,
          'user_id', user_id
        ));
        RETURN false;
      END IF;
    END IF;
  END IF;

  -- Enforce password policy if enabled for the org.
  -- Service principals are exempt because they have no password.
  IF v_effective_org_id IS NOT NULL THEN
    v_password_policy_ok := public.user_meets_password_policy(user_id, v_effective_org_id);
    IF v_password_policy_ok = false THEN
      IF NOT public.is_service_principal(user_id) THEN
        PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_PASSWORD_POLICY_ENFORCEMENT', jsonb_build_object(
          'org_id', COALESCE(org_id, v_effective_org_id),
          'app_id', app_id,
          'channel_id', channel_id,
          'min_right', min_right::text,
          'user_id', user_id
        ));
        RETURN false;
      END IF;
    END IF;
  END IF;

  v_use_rbac := public.rbac_is_enabled_for_org(v_effective_org_id);
  IF NOT v_use_rbac THEN
    RETURN public.check_min_rights_legacy(min_right, user_id, COALESCE(org_id, v_effective_org_id), app_id, channel_id);
  END IF;

  IF channel_id IS NOT NULL THEN
    v_scope := public.rbac_scope_channel();
  ELSIF app_id IS NOT NULL THEN
    v_scope := public.rbac_scope_app();
  ELSE
    v_scope := public.rbac_scope_org();
  END IF;

  v_perm := public.rbac_permission_for_legacy(min_right, v_scope);

  IF user_id IS NOT NULL THEN
    v_allowed := public.rbac_has_permission(public.rbac_principal_user(), user_id, v_perm, v_effective_org_id, app_id, channel_id);
  END IF;

  -- Fallback 1: capgkey header — API key presented explicitly (non-JWT path).
  -- Also considers apikey principal when RBAC is enabled (API keys can hold roles directly).
  IF NOT v_allowed THEN
    SELECT public.get_apikey_header() INTO v_apikey;
    IF v_apikey IS NOT NULL THEN
      -- Enforce org/app scoping before using the apikey RBAC principal.
      SELECT * FROM public.find_apikey_by_value(v_apikey) INTO api_key;
      IF api_key.id IS NOT NULL THEN
        IF public.is_apikey_expired(api_key.expires_at) THEN
          PERFORM public.pg_log('deny: API_KEY_EXPIRED', jsonb_build_object('key_id', api_key.id, 'org_id', v_effective_org_id, 'app_id', app_id));
        ELSIF v_effective_org_id IS NULL THEN
          PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_APIKEY_NO_ORG', jsonb_build_object('app_id', app_id));
        ELSIF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 AND NOT (v_effective_org_id = ANY(api_key.limited_to_orgs)) THEN
          PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_APIKEY_ORG_RESTRICT', jsonb_build_object('org_id', v_effective_org_id, 'app_id', app_id));
        ELSIF app_id IS NOT NULL AND api_key.limited_to_apps IS DISTINCT FROM '{}' AND NOT (app_id = ANY(api_key.limited_to_apps)) THEN
          PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_APIKEY_APP_RESTRICT', jsonb_build_object('org_id', v_effective_org_id, 'app_id', app_id));
        ELSE
          v_apikey_principal := api_key.rbac_id;
          IF v_apikey_principal IS NOT NULL THEN
            v_allowed := public.rbac_has_permission(public.rbac_principal_apikey(), v_apikey_principal, v_perm, v_effective_org_id, app_id, channel_id);
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  -- Fallback 2: service-principal JWT path.
  -- When auth.uid() = rbac_id (middleware signed a SP JWT), user_id carries the
  -- rbac_id but there is no capgkey header. Look up the apikey by rbac_id and
  -- apply the same org/app scope checks before granting the RBAC principal.
  IF NOT v_allowed AND user_id IS NOT NULL THEN
    SELECT * INTO v_sp_apikey
    FROM public.apikeys
    WHERE rbac_id = check_min_rights.user_id
      AND service_principal_provisioned = true
      AND NOT public.is_apikey_expired(expires_at)
    LIMIT 1;

    IF v_sp_apikey.id IS NOT NULL THEN
      IF v_effective_org_id IS NULL THEN
        PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_SP_NO_ORG', jsonb_build_object('app_id', app_id, 'user_id', user_id));
      ELSIF COALESCE(array_length(v_sp_apikey.limited_to_orgs, 1), 0) > 0 AND NOT (v_effective_org_id = ANY(v_sp_apikey.limited_to_orgs)) THEN
        PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_SP_ORG_RESTRICT', jsonb_build_object('org_id', v_effective_org_id, 'app_id', app_id, 'user_id', user_id));
      ELSIF app_id IS NOT NULL AND v_sp_apikey.limited_to_apps IS DISTINCT FROM '{}' AND NOT (app_id = ANY(v_sp_apikey.limited_to_apps)) THEN
        PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_SP_APP_RESTRICT', jsonb_build_object('org_id', v_effective_org_id, 'app_id', app_id, 'user_id', user_id));
      ELSE
        v_allowed := public.rbac_has_permission(public.rbac_principal_apikey(), user_id, v_perm, v_effective_org_id, app_id, channel_id);
      END IF;
    END IF;
  END IF;

  IF NOT v_allowed THEN
    PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_RBAC', jsonb_build_object('org_id', COALESCE(org_id, v_effective_org_id), 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text, 'user_id', user_id, 'scope', v_scope, 'perm', v_perm));
  END IF;

  RETURN v_allowed;
END;
$$;

-- ============================================================================
-- 3. check_min_rights_legacy — legacy (non-RBAC) org path
--    Changes vs. previous version:
--      a) 2FA block exempts service principals.
--      b) Password policy block exempts service principals.
--      c) After the org_users FOR loop, a new SP fallback maps the key's
--         key_mode to a user_min_right and grants access if it covers min_right.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_min_rights_legacy(
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
  v_password_policy_ok boolean;
  v_sp_apikey record;
  v_sp_right public.user_min_right;
BEGIN
  IF user_id IS NULL THEN
    PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_NO_UID', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text));
    RETURN false;
  END IF;

  -- Enforce 2FA if the org requires it.
  -- Service principals are exempt (they cannot enroll in 2FA).
  IF org_id IS NOT NULL THEN
    SELECT enforcing_2fa INTO v_org_enforcing_2fa FROM public.orgs WHERE id = org_id;
    IF v_org_enforcing_2fa = true AND NOT public.has_2fa_enabled(user_id) THEN
      IF NOT public.is_service_principal(user_id) THEN
        PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_2FA_ENFORCEMENT', jsonb_build_object(
          'org_id', org_id,
          'app_id', app_id,
          'channel_id', channel_id,
          'min_right', min_right::text,
          'user_id', user_id
        ));
        RETURN false;
      END IF;
    END IF;
  END IF;

  -- Enforce password policy if enabled for the org.
  -- Service principals are exempt (they have no password).
  IF org_id IS NOT NULL THEN
    v_password_policy_ok := public.user_meets_password_policy(user_id, org_id);
    IF v_password_policy_ok = false THEN
      IF NOT public.is_service_principal(user_id) THEN
        PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_PASSWORD_POLICY_ENFORCEMENT', jsonb_build_object(
          'org_id', org_id,
          'app_id', app_id,
          'channel_id', channel_id,
          'min_right', min_right::text,
          'user_id', user_id
        ));
        RETURN false;
      END IF;
    END IF;
  END IF;

  FOR user_right_record IN
    SELECT org_users.user_right, org_users.app_id, org_users.channel_id
    FROM public.org_users
    WHERE org_users.org_id = check_min_rights_legacy.org_id AND org_users.user_id = check_min_rights_legacy.user_id
  LOOP
    IF (user_right_record.user_right >= min_right AND user_right_record.app_id IS NULL AND user_right_record.channel_id IS NULL) OR
       (user_right_record.user_right >= min_right AND user_right_record.app_id = check_min_rights_legacy.app_id AND user_right_record.channel_id IS NULL) OR
       (user_right_record.user_right >= min_right AND user_right_record.app_id = check_min_rights_legacy.app_id AND user_right_record.channel_id = check_min_rights_legacy.channel_id)
    THEN
      RETURN true;
    END IF;
  END LOOP;

  -- Service-principal JWT fallback.
  -- The org_users loop found no matching row because the service principal is
  -- not a human member of the org. Instead, evaluate access from the API key's
  -- key_mode, applying the same org/app scope restrictions.
  SELECT * INTO v_sp_apikey
  FROM public.apikeys
  WHERE rbac_id = check_min_rights_legacy.user_id
    AND service_principal_provisioned = true
    AND NOT public.is_apikey_expired(expires_at)
  LIMIT 1;

  IF v_sp_apikey.id IS NOT NULL THEN
    IF org_id IS NULL THEN
      PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_SP_NO_ORG', jsonb_build_object('app_id', app_id, 'user_id', user_id));
    ELSIF COALESCE(array_length(v_sp_apikey.limited_to_orgs, 1), 0) > 0 AND NOT (org_id = ANY(v_sp_apikey.limited_to_orgs)) THEN
      PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_SP_ORG_RESTRICT', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'user_id', user_id));
    ELSIF app_id IS NOT NULL AND v_sp_apikey.limited_to_apps IS DISTINCT FROM '{}' AND NOT (app_id = ANY(v_sp_apikey.limited_to_apps)) THEN
      PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_SP_APP_RESTRICT', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'user_id', user_id));
    ELSE
      -- Map key_mode to user_min_right.
      -- 'all' inherits the owner's org-level right (highest org-scoped row).
      IF v_sp_apikey.mode = 'read' THEN
        v_sp_right := 'read'::public.user_min_right;
      ELSIF v_sp_apikey.mode = 'upload' THEN
        v_sp_right := 'upload'::public.user_min_right;
      ELSIF v_sp_apikey.mode = 'write' THEN
        v_sp_right := 'write'::public.user_min_right;
      ELSIF v_sp_apikey.mode = 'all' THEN
        SELECT ou.user_right INTO v_sp_right
        FROM public.org_users ou
        WHERE ou.user_id = v_sp_apikey.user_id
          AND ou.org_id = check_min_rights_legacy.org_id
          AND ou.app_id IS NULL
          AND ou.channel_id IS NULL
        ORDER BY ou.user_right DESC
        LIMIT 1;
      END IF;

      IF v_sp_right IS NOT NULL AND v_sp_right >= min_right THEN
        RETURN true;
      END IF;
    END IF;
  END IF;

  PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text, 'user_id', user_id));
  RETURN false;
END;
$$;

-- ============================================================================
-- 4. check_min_rights_legacy_no_password_policy
--    Changes vs. previous version:
--      a) 2FA block exempts service principals.
--      b) After the org_users FOR loop, add the same SP fallback as above.
-- ============================================================================

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
  v_sp_apikey record;
  v_sp_right public.user_min_right;
BEGIN
  IF user_id IS NULL THEN
    PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_LEGACY_NO_UID', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text));
    RETURN false;
  END IF;

  -- Enforce 2FA if the org requires it.
  -- Service principals are exempt (they cannot enroll in 2FA).
  IF org_id IS NOT NULL THEN
    SELECT enforcing_2fa INTO v_org_enforcing_2fa FROM public.orgs WHERE id = org_id;
    IF v_org_enforcing_2fa = true AND NOT public.has_2fa_enabled(user_id) THEN
      IF NOT public.is_service_principal(user_id) THEN
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

  -- Service-principal JWT fallback (same logic as check_min_rights_legacy).
  SELECT * INTO v_sp_apikey
  FROM public.apikeys
  WHERE rbac_id = check_min_rights_legacy_no_password_policy.user_id
    AND service_principal_provisioned = true
    AND NOT public.is_apikey_expired(expires_at)
  LIMIT 1;

  IF v_sp_apikey.id IS NOT NULL THEN
    IF org_id IS NULL THEN
      PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_SP_NO_ORG', jsonb_build_object('app_id', app_id, 'user_id', user_id));
    ELSIF COALESCE(array_length(v_sp_apikey.limited_to_orgs, 1), 0) > 0 AND NOT (org_id = ANY(v_sp_apikey.limited_to_orgs)) THEN
      PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_SP_ORG_RESTRICT', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'user_id', user_id));
    ELSIF app_id IS NOT NULL AND v_sp_apikey.limited_to_apps IS DISTINCT FROM '{}' AND NOT (app_id = ANY(v_sp_apikey.limited_to_apps)) THEN
      PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_SP_APP_RESTRICT', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'user_id', user_id));
    ELSE
      IF v_sp_apikey.mode = 'read' THEN
        v_sp_right := 'read'::public.user_min_right;
      ELSIF v_sp_apikey.mode = 'upload' THEN
        v_sp_right := 'upload'::public.user_min_right;
      ELSIF v_sp_apikey.mode = 'write' THEN
        v_sp_right := 'write'::public.user_min_right;
      ELSIF v_sp_apikey.mode = 'all' THEN
        SELECT ou.user_right INTO v_sp_right
        FROM public.org_users ou
        WHERE ou.user_id = v_sp_apikey.user_id
          AND ou.org_id = check_min_rights_legacy_no_password_policy.org_id
          AND ou.app_id IS NULL
          AND ou.channel_id IS NULL
        ORDER BY ou.user_right DESC
        LIMIT 1;
      END IF;

      IF v_sp_right IS NOT NULL AND v_sp_right >= min_right THEN
        RETURN true;
      END IF;
    END IF;
  END IF;

  PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_LEGACY_NO_PW', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text, 'user_id', user_id));
  RETURN false;
END;
$$;

ALTER FUNCTION public.check_min_rights_legacy_no_password_policy(
    public.user_min_right, uuid, uuid, character varying, bigint
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.check_min_rights_legacy_no_password_policy(
    public.user_min_right, uuid, uuid, character varying, bigint
) FROM public;
REVOKE ALL ON FUNCTION public.check_min_rights_legacy_no_password_policy(
    public.user_min_right, uuid, uuid, character varying, bigint
) FROM anon;
REVOKE ALL ON FUNCTION public.check_min_rights_legacy_no_password_policy(
    public.user_min_right, uuid, uuid, character varying, bigint
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_min_rights_legacy_no_password_policy(
    public.user_min_right, uuid, uuid, character varying, bigint
) TO service_role;
