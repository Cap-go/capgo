CREATE OR REPLACE FUNCTION "public"."app_versions_readable_app_ids"()
RETURNS character varying[]
LANGUAGE "plpgsql" VOLATILE SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_user_id uuid;
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
  v_principal_type text;
  v_principal_id uuid;
  v_allowed character varying[] := '{}'::character varying[];
BEGIN
  SELECT auth.uid() INTO v_user_id;
  SELECT public.get_apikey_header() INTO v_api_key_text;

  IF v_api_key_text IS NOT NULL THEN
    SELECT * INTO v_api_key
    FROM public.find_apikey_by_value(v_api_key_text)
    LIMIT 1;

    IF v_api_key.id IS NULL OR public.is_apikey_expired(v_api_key.expires_at) THEN
      RETURN v_allowed;
    END IF;

    v_user_id := v_api_key.user_id;
    v_principal_type := public.rbac_principal_apikey();
    v_principal_id := v_api_key.rbac_id;
  ELSIF v_user_id IS NOT NULL THEN
    v_principal_type := public.rbac_principal_user();
    v_principal_id := v_user_id;
  ELSE
    RETURN v_allowed;
  END IF;

  IF v_principal_id IS NULL THEN
    RETURN v_allowed;
  END IF;

  WITH RECURSIVE direct_bindings AS (
    SELECT rb.role_id, rb.scope_type, rb.org_id, rb.app_id
    FROM public.role_bindings rb
    WHERE rb.principal_type = v_principal_type
      AND rb.principal_id = v_principal_id
      AND rb.scope_type IN (public.rbac_scope_org(), public.rbac_scope_app())
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())

    UNION

    SELECT rb.role_id, rb.scope_type, rb.org_id, rb.app_id
    FROM public.group_members gm
    INNER JOIN public.groups g ON g.id = gm.group_id
    INNER JOIN public.role_bindings rb
      ON rb.principal_type = public.rbac_principal_group()
      AND rb.principal_id = gm.group_id
      AND rb.org_id = g.org_id
    WHERE v_principal_type = public.rbac_principal_user()
      AND gm.user_id = v_principal_id
      AND rb.scope_type IN (public.rbac_scope_org(), public.rbac_scope_app())
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ),
  role_closure AS (
    SELECT
      direct_bindings.role_id,
      direct_bindings.role_id AS effective_role_id,
      direct_bindings.scope_type,
      direct_bindings.org_id,
      direct_bindings.app_id
    FROM direct_bindings

    UNION

    SELECT
      role_closure.role_id,
      role_hierarchy.child_role_id,
      role_closure.scope_type,
      role_closure.org_id,
      role_closure.app_id
    FROM role_closure
    INNER JOIN public.role_hierarchy
      ON role_hierarchy.parent_role_id = role_closure.effective_role_id
    INNER JOIN public.roles child_role
      ON child_role.id = role_hierarchy.child_role_id
      AND child_role.scope_type = role_closure.scope_type
  ),
  readable_scopes AS (
    SELECT DISTINCT role_closure.scope_type, role_closure.org_id, role_closure.app_id
    FROM role_closure
    INNER JOIN public.role_permissions
      ON role_permissions.role_id = role_closure.effective_role_id
    INNER JOIN public.permissions
      ON permissions.id = role_permissions.permission_id
    WHERE permissions.key = public.rbac_perm_app_read()
  ),
  legacy_readable_scopes AS (
    SELECT
      CASE
        WHEN org_users.app_id IS NULL THEN public.rbac_scope_org()
        ELSE public.rbac_scope_app()
      END AS scope_type,
      org_users.org_id,
      apps.id AS app_id
    FROM public.org_users
    LEFT JOIN public.apps
      ON apps.app_id = org_users.app_id
      AND apps.owner_org = org_users.org_id
    WHERE v_api_key_text IS NULL
      AND v_user_id IS NOT NULL
      AND org_users.user_id = v_user_id
      AND org_users.user_right >= 'read'::public.user_min_right
      AND org_users.channel_id IS NULL
  ),
  scoped_apps AS (
    SELECT apps.app_id, apps.owner_org
    FROM readable_scopes
    INNER JOIN public.apps
      ON apps.owner_org = readable_scopes.org_id
    WHERE readable_scopes.scope_type = public.rbac_scope_org()

    UNION

    SELECT apps.app_id, apps.owner_org
    FROM readable_scopes
    INNER JOIN public.apps
      ON apps.id = readable_scopes.app_id
      AND apps.owner_org = readable_scopes.org_id
    WHERE readable_scopes.scope_type = public.rbac_scope_app()
      AND readable_scopes.app_id IS NOT NULL

    UNION

    SELECT apps.app_id, apps.owner_org
    FROM legacy_readable_scopes
    INNER JOIN public.apps
      ON apps.owner_org = legacy_readable_scopes.org_id
    WHERE legacy_readable_scopes.scope_type = public.rbac_scope_org()

    UNION

    SELECT apps.app_id, apps.owner_org
    FROM legacy_readable_scopes
    INNER JOIN public.apps
      ON apps.id = legacy_readable_scopes.app_id
      AND apps.owner_org = legacy_readable_scopes.org_id
    WHERE legacy_readable_scopes.scope_type = public.rbac_scope_app()
      AND legacy_readable_scopes.app_id IS NOT NULL
  ),
  candidate_orgs AS (
    SELECT DISTINCT scoped_apps.owner_org
    FROM scoped_apps
  ),
  readable_orgs AS (
    SELECT orgs.id
    FROM candidate_orgs
    INNER JOIN public.orgs ON orgs.id = candidate_orgs.owner_org
    WHERE (
        orgs.enforcing_2fa IS NOT TRUE
        OR (v_user_id IS NOT NULL AND public.has_2fa_enabled(v_user_id))
      )
      AND public.user_meets_password_policy(v_user_id, orgs.id) IS DISTINCT FROM false
  )
  SELECT COALESCE(array_agg(DISTINCT scoped_apps.app_id), '{}'::character varying[])
  INTO v_allowed
  FROM scoped_apps
  INNER JOIN readable_orgs ON readable_orgs.id = scoped_apps.owner_org;

  RETURN v_allowed;
END;
$$;

ALTER FUNCTION "public"."app_versions_readable_app_ids"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."app_versions_readable_app_ids"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."app_versions_readable_app_ids"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."app_versions_readable_app_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."app_versions_readable_app_ids"() TO "service_role";

COMMENT ON FUNCTION "public"."app_versions_readable_app_ids"() IS
'Returns app IDs whose bundle rows are readable by the current authenticated user or Capgo API key. The lookup starts from caller-scoped role bindings and expands role permissions set-wise so targeted app_versions updates do not scan every app through per-app RBAC checks.';
