-- Enforce that app-scoped permission checks cannot be authorized through a foreign org_id.

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
  v_app_owner_org uuid;
  v_org_enforcing_2fa boolean;
  v_password_policy_ok boolean;
  api_key record;
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
    SELECT owner_org INTO v_effective_org_id FROM public.channels WHERE public.channels.id = channel_id LIMIT 1;
  END IF;

  -- Enforce 2FA if the org requires it.
  IF v_effective_org_id IS NOT NULL THEN
    SELECT enforcing_2fa INTO v_org_enforcing_2fa FROM public.orgs WHERE id = v_effective_org_id;
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
  END IF;

  -- Enforce password policy if enabled for the org.
  IF v_effective_org_id IS NOT NULL THEN
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

  IF user_id IS NOT NULL THEN
    v_allowed := public.rbac_has_permission(public.rbac_principal_user(), user_id, v_perm, v_effective_org_id, app_id, channel_id);
  END IF;

  -- Also consider apikey principal when RBAC is enabled (API keys can hold roles directly).
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

  IF NOT v_allowed THEN
    PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_RBAC', jsonb_build_object('org_id', COALESCE(org_id, v_effective_org_id), 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text, 'user_id', user_id, 'scope', v_scope, 'perm', v_perm));
  END IF;

  RETURN v_allowed;
END;
$$;

ALTER FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "service_role";
