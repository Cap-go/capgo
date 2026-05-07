CREATE OR REPLACE FUNCTION "public"."app_versions_readable_app_ids"()
RETURNS character varying[]
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_user_id uuid;
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
  v_allowed character varying[] := '{}'::character varying[];
BEGIN
  SELECT auth.uid() INTO v_user_id;

  -- No authenticated user and no Capgo API key means no readable bundles.
  IF v_user_id IS NULL THEN
    SELECT public.get_apikey_header() INTO v_api_key_text;
    IF v_api_key_text IS NULL THEN
      RETURN v_allowed;
    END IF;

    SELECT *
    FROM public.find_apikey_by_value(v_api_key_text)
    INTO v_api_key;

    IF v_api_key.id IS NULL THEN
      RETURN v_allowed;
    END IF;

    IF public.is_apikey_expired(v_api_key.expires_at) THEN
      RETURN v_allowed;
    END IF;

    IF v_api_key.mode IS NOT NULL THEN
      IF NOT (v_api_key.mode = ANY('{read,upload,write,all}'::public.key_mode[])) THEN
        RETURN v_allowed;
      END IF;

      v_user_id := v_api_key.user_id;
    END IF;
  END IF;

  WITH candidate_apps AS (
    -- Legacy org-scoped grants can read every app in the org.
    SELECT apps.app_id, apps.owner_org
    FROM public.org_users
    INNER JOIN public.apps ON apps.owner_org = org_users.org_id
    WHERE v_user_id IS NOT NULL
      AND org_users.user_id = v_user_id
      AND org_users.user_right >= 'read'::public.user_min_right
      AND org_users.app_id IS NULL
      AND org_users.channel_id IS NULL

    UNION

    -- Legacy app-scoped grants can read that app.
    SELECT apps.app_id, apps.owner_org
    FROM public.org_users
    INNER JOIN public.apps
      ON apps.app_id = org_users.app_id
      AND apps.owner_org = org_users.org_id
    WHERE v_user_id IS NOT NULL
      AND org_users.user_id = v_user_id
      AND org_users.user_right >= 'read'::public.user_min_right
      AND org_users.app_id IS NOT NULL
      AND org_users.channel_id IS NULL

    UNION

    -- RBAC org-scoped direct user/API-key bindings can read candidate apps in the org.
    SELECT apps.app_id, apps.owner_org
    FROM public.role_bindings
    INNER JOIN public.apps ON apps.owner_org = role_bindings.org_id
    WHERE role_bindings.scope_type = public.rbac_scope_org()
      AND role_bindings.org_id IS NOT NULL
      AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())
      AND (
        (
          v_user_id IS NOT NULL
          AND role_bindings.principal_type = public.rbac_principal_user()
          AND role_bindings.principal_id = v_user_id
        )
        OR (
          v_api_key.rbac_id IS NOT NULL
          AND role_bindings.principal_type = public.rbac_principal_apikey()
          AND role_bindings.principal_id = v_api_key.rbac_id
        )
      )

    UNION

    -- RBAC app-scoped direct user/API-key bindings can read candidate apps.
    SELECT apps.app_id, apps.owner_org
    FROM public.role_bindings
    INNER JOIN public.apps
      ON apps.id = role_bindings.app_id
      AND apps.owner_org = role_bindings.org_id
    WHERE role_bindings.scope_type = public.rbac_scope_app()
      AND role_bindings.app_id IS NOT NULL
      AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())
      AND (
        (
          v_user_id IS NOT NULL
          AND role_bindings.principal_type = public.rbac_principal_user()
          AND role_bindings.principal_id = v_user_id
        )
        OR (
          v_api_key.rbac_id IS NOT NULL
          AND role_bindings.principal_type = public.rbac_principal_apikey()
          AND role_bindings.principal_id = v_api_key.rbac_id
        )
      )

    UNION

    -- RBAC group org-scoped bindings are user-only and can read candidate apps in the org.
    SELECT apps.app_id, apps.owner_org
    FROM public.group_members
    INNER JOIN public.groups ON groups.id = group_members.group_id
    INNER JOIN public.role_bindings
      ON role_bindings.principal_type = public.rbac_principal_group()
      AND role_bindings.principal_id = group_members.group_id
      AND role_bindings.scope_type = public.rbac_scope_org()
      AND role_bindings.org_id = groups.org_id
    INNER JOIN public.apps ON apps.owner_org = role_bindings.org_id
    WHERE v_user_id IS NOT NULL
      AND group_members.user_id = v_user_id
      AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())

    UNION

    -- RBAC group app-scoped bindings are user-only and can read candidate apps.
    SELECT apps.app_id, apps.owner_org
    FROM public.group_members
    INNER JOIN public.groups ON groups.id = group_members.group_id
    INNER JOIN public.role_bindings
      ON role_bindings.principal_type = public.rbac_principal_group()
      AND role_bindings.principal_id = group_members.group_id
      AND role_bindings.scope_type = public.rbac_scope_app()
      AND role_bindings.org_id = groups.org_id
    INNER JOIN public.apps
      ON apps.id = role_bindings.app_id
      AND apps.owner_org = role_bindings.org_id
    WHERE v_user_id IS NOT NULL
      AND group_members.user_id = v_user_id
      AND role_bindings.app_id IS NOT NULL
      AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())
  )
  SELECT COALESCE(array_agg(DISTINCT candidate_apps.app_id), '{}'::character varying[])
  INTO v_allowed
  FROM candidate_apps
  WHERE (
      v_api_key.id IS NULL
      OR COALESCE(array_length(v_api_key.limited_to_orgs, 1), 0) = 0
      OR candidate_apps.owner_org = ANY(v_api_key.limited_to_orgs)
    )
    AND (
      v_api_key.id IS NULL
      OR v_api_key.limited_to_apps IS NULL
      OR v_api_key.limited_to_apps = '{}'::character varying[]
      OR candidate_apps.app_id = ANY(v_api_key.limited_to_apps)
    )
    -- Candidate collection is intentionally broad; this exact check preserves
    -- legacy/RBAC permission semantics, 2FA, password policy, and API-key scope.
    AND public.check_min_rights(
      'read'::public.user_min_right,
      v_user_id,
      candidate_apps.owner_org,
      candidate_apps.app_id,
      NULL::bigint
    );

  RETURN v_allowed;
END;
$$;

ALTER FUNCTION "public"."app_versions_readable_app_ids"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."app_versions_readable_app_ids"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."app_versions_readable_app_ids"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."app_versions_readable_app_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."app_versions_readable_app_ids"() TO "service_role";

COMMENT ON FUNCTION "public"."app_versions_readable_app_ids"() IS
'Returns app IDs whose bundle rows are readable by the current authenticated user or Capgo API key. It only evaluates candidate apps from legacy/RBAC bindings, then verifies each candidate with check_min_rights() to avoid global app scans while preserving authorization semantics.';

DROP POLICY IF EXISTS "Allow for auth, api keys (read+)" -- noqa: RF05,LT05
ON "public"."app_versions";

CREATE POLICY "Allow for auth, api keys (read+)" -- noqa: RF05,LT05
ON "public"."app_versions"
FOR SELECT
TO "anon", "authenticated"
USING (
  "app_id" = ANY(
    COALESCE((SELECT "public"."app_versions_readable_app_ids"()), '{}'::character varying[])
  )
);
