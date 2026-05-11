-- Bind public subject-taking permission helpers to the request identity.

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
  v_perm text;
  v_scope text;
  v_apikey text;
  v_apikey_user_id uuid;
  v_request_role text;
  v_use_rbac boolean;
  v_effective_org_id uuid := org_id;
  v_app_owner_org uuid;
  v_channel_owner_org uuid;
  v_channel_app_id character varying;
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
          'has_org_id', v_effective_org_id IS NOT NULL,
          'has_app_owner_org', v_app_owner_org IS NOT NULL,
          'has_app_id', app_id IS NOT NULL,
          'has_channel_id', channel_id IS NOT NULL,
          'min_right', min_right::text,
          'has_user_id', user_id IS NOT NULL,
          'org_matches_app_owner', v_effective_org_id IS NOT DISTINCT FROM v_app_owner_org
        ));
        RETURN false;
      END IF;

      v_effective_org_id := v_app_owner_org;
    END IF;
  END IF;

  -- Existing channels are always authorized in their owning org/app scope.
  IF channel_id IS NOT NULL THEN
    SELECT lookup_channel.owner_org, lookup_channel.app_id
    INTO v_channel_owner_org, v_channel_app_id
    FROM public.channels AS lookup_channel
    WHERE lookup_channel.id = check_min_rights.channel_id
    LIMIT 1;

    IF v_channel_owner_org IS NOT NULL THEN
      IF v_effective_org_id IS NOT NULL AND v_effective_org_id IS DISTINCT FROM v_channel_owner_org THEN
        PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_CHANNEL_ORG_MISMATCH', jsonb_build_object(
          'has_org_id', v_effective_org_id IS NOT NULL,
          'has_channel_owner_org', v_channel_owner_org IS NOT NULL,
          'has_app_id', app_id IS NOT NULL,
          'has_channel_id', channel_id IS NOT NULL,
          'min_right', min_right::text,
          'has_user_id', user_id IS NOT NULL,
          'org_matches_channel_owner', v_effective_org_id IS NOT DISTINCT FROM v_channel_owner_org
        ));
        RETURN false;
      END IF;

      IF app_id IS NOT NULL AND v_channel_app_id IS DISTINCT FROM check_min_rights.app_id THEN
        PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_CHANNEL_APP_MISMATCH', jsonb_build_object(
          'has_org_id', COALESCE(org_id, v_effective_org_id) IS NOT NULL,
          'has_app_id', app_id IS NOT NULL,
          'has_channel_id', channel_id IS NOT NULL,
          'min_right', min_right::text,
          'has_user_id', user_id IS NOT NULL,
          'has_channel_app_id', v_channel_app_id IS NOT NULL,
          'app_matches_channel', v_channel_app_id IS NOT DISTINCT FROM check_min_rights.app_id
        ));
        RETURN false;
      END IF;

      v_effective_org_id := v_channel_owner_org;
    END IF;
  END IF;

  SELECT public.get_apikey_header() INTO v_apikey;
  v_request_role := public.current_request_role();

  IF v_request_role IN ('anon', 'authenticated') THEN
    IF user_id IS NULL THEN
      IF v_apikey IS NULL THEN
        PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_UNBOUND_PUBLIC_SUBJECT', jsonb_build_object(
          'has_org_id', COALESCE(org_id, v_effective_org_id) IS NOT NULL,
          'has_app_id', app_id IS NOT NULL,
          'has_channel_id', channel_id IS NOT NULL,
          'min_right', min_right::text,
          'request_role', v_request_role
        ));
        RETURN false;
      END IF;
    ELSIF v_apikey IS NOT NULL THEN
      SELECT found_key.user_id INTO v_apikey_user_id
      FROM public.find_apikey_by_value(v_apikey) AS found_key
      LIMIT 1;

      IF v_apikey_user_id IS NULL OR v_apikey_user_id IS DISTINCT FROM user_id THEN
        PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_APIKEY_SUBJECT_MISMATCH', jsonb_build_object(
          'has_org_id', COALESCE(org_id, v_effective_org_id) IS NOT NULL,
          'has_app_id', app_id IS NOT NULL,
          'has_channel_id', channel_id IS NOT NULL,
          'min_right', min_right::text,
          'has_user_id', user_id IS NOT NULL,
          'has_auth_uid', auth.uid() IS NOT NULL,
          'request_role', v_request_role,
          'has_apikey_subject', v_apikey_user_id IS NOT NULL,
          'subject_matches_auth', user_id IS NOT DISTINCT FROM auth.uid(),
          'subject_matches_apikey', user_id IS NOT DISTINCT FROM v_apikey_user_id
        ));
        RETURN false;
      END IF;
    ELSIF user_id IS DISTINCT FROM auth.uid() THEN
      PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_PUBLIC_SUBJECT_MISMATCH', jsonb_build_object(
        'has_org_id', COALESCE(org_id, v_effective_org_id) IS NOT NULL,
        'has_app_id', app_id IS NOT NULL,
        'has_channel_id', channel_id IS NOT NULL,
        'min_right', min_right::text,
        'has_user_id', user_id IS NOT NULL,
        'has_auth_uid', auth.uid() IS NOT NULL,
        'subject_matches_auth', user_id IS NOT DISTINCT FROM auth.uid(),
        'request_role', v_request_role
      ));
      RETURN false;
    END IF;
  END IF;

  -- RBAC-managed API keys have apikeys.mode = NULL, so get_identity_org_appid()
  -- returns NULL and rbac_check_permission_direct() must resolve the key before
  -- org identity gates can be evaluated.
  IF v_effective_org_id IS NOT NULL AND NOT (v_apikey IS NOT NULL AND user_id IS NULL) THEN
    SELECT enforcing_2fa INTO v_org_enforcing_2fa
    FROM public.orgs
    WHERE id = v_effective_org_id;

    IF v_org_enforcing_2fa = true AND (user_id IS NULL OR NOT public.has_2fa_enabled(user_id)) THEN
      PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_2FA_ENFORCEMENT', jsonb_build_object(
        'has_org_id', COALESCE(org_id, v_effective_org_id) IS NOT NULL,
        'has_app_id', app_id IS NOT NULL,
        'has_channel_id', channel_id IS NOT NULL,
        'min_right', min_right::text,
        'has_user_id', user_id IS NOT NULL
      ));
      RETURN false;
    END IF;

    v_password_policy_ok := public.user_meets_password_policy(user_id, v_effective_org_id);
    IF v_password_policy_ok = false THEN
      PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_PASSWORD_POLICY_ENFORCEMENT', jsonb_build_object(
        'has_org_id', COALESCE(org_id, v_effective_org_id) IS NOT NULL,
        'has_app_id', app_id IS NOT NULL,
        'has_channel_id', channel_id IS NOT NULL,
        'min_right', min_right::text,
        'has_user_id', user_id IS NOT NULL
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

REVOKE ALL ON FUNCTION "public"."check_min_rights_legacy"(
  "min_right" "public"."user_min_right",
  "user_id" "uuid",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."check_min_rights_legacy"(
  "min_right" "public"."user_min_right",
  "user_id" "uuid",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) TO "service_role";

REVOKE ALL ON FUNCTION "public"."rbac_check_permission_direct"(
  "p_permission_key" "text",
  "p_user_id" "uuid",
  "p_org_id" "uuid",
  "p_app_id" character varying,
  "p_channel_id" bigint,
  "p_apikey" "text"
) FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."rbac_check_permission_direct"(
  "p_permission_key" "text",
  "p_user_id" "uuid",
  "p_org_id" "uuid",
  "p_app_id" character varying,
  "p_channel_id" bigint,
  "p_apikey" "text"
) TO "service_role";

REVOKE ALL ON FUNCTION "public"."rbac_check_permission_direct_no_password_policy"(
  "p_permission_key" "text",
  "p_user_id" "uuid",
  "p_org_id" "uuid",
  "p_app_id" character varying,
  "p_channel_id" bigint,
  "p_apikey" "text"
) FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."rbac_check_permission_direct_no_password_policy"(
  "p_permission_key" "text",
  "p_user_id" "uuid",
  "p_org_id" "uuid",
  "p_app_id" character varying,
  "p_channel_id" bigint,
  "p_apikey" "text"
) TO "service_role";
