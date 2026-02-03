-- ============================================================================
-- Enforce API key org/app scoping in RBAC fallback + reaffirm grants
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
BEGIN
  -- Derive org from app/channel when not provided to honor org-level flag and scoping.
  IF v_effective_org_id IS NULL AND app_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id FROM public.apps WHERE public.apps.app_id = check_min_rights.app_id LIMIT 1;
  END IF;
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

-- Reaffirm execute grants for functions used by RLS and API key flows.
GRANT EXECUTE ON FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") TO "service_role";
