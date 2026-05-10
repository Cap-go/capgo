CREATE OR REPLACE FUNCTION "public"."check_min_rights"(
  "min_right" "public"."user_min_right",
  "user_id" "uuid",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) RETURNS boolean
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_perm text;
  v_scope text;
  v_apikey text;
  v_use_rbac boolean;
  v_effective_org_id uuid := org_id;
  v_app_owner_org uuid;
  v_org_enforcing_2fa boolean;
  v_password_policy_ok boolean;
BEGIN
  -- Existing apps are always authorized in the app owner's org scope.
  -- Keep nonexistent apps on the caller org so API handlers can still return their
  -- own not-found errors after a valid org-level check.
  IF app_id IS NOT NULL THEN
    SELECT owner_org INTO v_app_owner_org
    FROM public.apps
    WHERE public.apps.app_id = check_min_rights.app_id
    LIMIT 1;

    IF v_app_owner_org IS NOT NULL THEN
      IF v_effective_org_id IS NOT NULL AND v_effective_org_id IS DISTINCT FROM v_app_owner_org THEN
        PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_APP_ORG_MISMATCH', jsonb_build_object(
          'org_id', v_effective_org_id,
          'app_owner_org', v_app_owner_org,
          'app_id', app_id,
          'channel_id', channel_id,
          'min_right', min_right::text,
          'user_id', user_id
        ));
        RETURN false;
      END IF;

      v_effective_org_id := v_app_owner_org;
    END IF;
  END IF;

  -- Derive org from channel when not provided to honor org-level flag and scoping.
  IF v_effective_org_id IS NULL AND channel_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id
    FROM public.channels
    WHERE public.channels.id = channel_id
    LIMIT 1;
  END IF;

  SELECT public.get_apikey_header() INTO v_apikey;

  -- RBAC-managed API keys have apikeys.mode = NULL, so get_identity_org_appid()
  -- returns NULL and rbac_check_permission_direct() must resolve the key before
  -- org identity gates can be evaluated.
  IF v_effective_org_id IS NOT NULL AND NOT (v_apikey IS NOT NULL AND user_id IS NULL) THEN
    SELECT enforcing_2fa INTO v_org_enforcing_2fa
    FROM public.orgs
    WHERE id = v_effective_org_id;

    IF v_org_enforcing_2fa = true AND (user_id IS NULL OR NOT public.has_2fa_enabled(user_id)) THEN
      PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_2FA_ENFORCEMENT', jsonb_build_object(
        'org_id', COALESCE(org_id, v_effective_org_id),
        'app_id', app_id,
        'channel_id', channel_id,
        'min_right', min_right::text,
        'user_id', user_id
      ));
      RETURN false;
    END IF;

    v_password_policy_ok := public.user_meets_password_policy(user_id, v_effective_org_id);
    IF v_password_policy_ok = false THEN
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

  -- Keep RLS authorization semantics aligned with explicit RBAC checks. In
  -- particular, an API key with direct role bindings must be evaluated as the
  -- API-key principal and must not inherit broader owner-user permissions.
  RETURN public.rbac_check_permission_direct(
    v_perm,
    user_id,
    v_effective_org_id,
    app_id,
    channel_id,
    v_apikey
  );
END;
$$;

ALTER FUNCTION "public"."check_min_rights"(
  "min_right" "public"."user_min_right",
  "user_id" "uuid",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."check_min_rights"(
  "min_right" "public"."user_min_right",
  "user_id" "uuid",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."check_min_rights"(
  "min_right" "public"."user_min_right",
  "user_id" "uuid",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) TO "anon";

GRANT EXECUTE ON FUNCTION "public"."check_min_rights"(
  "min_right" "public"."user_min_right",
  "user_id" "uuid",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."check_min_rights"(
  "min_right" "public"."user_min_right",
  "user_id" "uuid",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) TO "service_role";
