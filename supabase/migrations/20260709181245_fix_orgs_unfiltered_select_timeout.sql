-- Fix unfiltered SELECT timeouts by avoiding per-row identity resolution.
-- The previous policies called get_identity*() and check_min_rights() for every
-- candidate row. Bare PostgREST requests like /orgs can therefore scan large
-- tables before RLS denies or filters the rows.

CREATE OR REPLACE FUNCTION "public"."orgs_with_min_right"("p_min_right" "public"."user_min_right")
RETURNS "uuid"[]
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_auth_user_id uuid;
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
  v_permission text;
  v_allowed uuid[] := '{}'::uuid[];
BEGIN
  SELECT "auth"."uid"() INTO v_auth_user_id;
  SELECT "public"."get_apikey_header"() INTO v_api_key_text;
  v_permission := "public"."rbac_permission_for_legacy"("p_min_right", "public"."rbac_scope_org"());

  IF v_api_key_text IS NOT NULL THEN
    SELECT *
    FROM "public"."find_apikey_by_value"(v_api_key_text)
    INTO v_api_key;

    IF v_api_key.id IS NOT NULL AND NOT "public"."is_apikey_expired"(v_api_key.expires_at) THEN
      SELECT COALESCE(array_agg(DISTINCT candidate_orgs.org_id), '{}'::uuid[])
      INTO v_allowed
      FROM (
        SELECT role_bindings.org_id
        FROM "public"."role_bindings"
        WHERE role_bindings.principal_type = "public"."rbac_principal_apikey"()
          AND role_bindings.principal_id = v_api_key.rbac_id
          AND role_bindings.scope_type = "public"."rbac_scope_org"()
          AND role_bindings.org_id IS NOT NULL
          AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())
      ) candidate_orgs
      WHERE "public"."rbac_check_permission_direct"(
        v_permission,
        v_api_key.user_id,
        candidate_orgs.org_id,
        NULL::character varying,
        NULL::bigint,
        v_api_key_text
      );

      RETURN v_allowed;
    END IF;

    IF v_auth_user_id IS NULL THEN
      RETURN v_allowed;
    END IF;
  END IF;

  IF v_auth_user_id IS NULL THEN
    RETURN v_allowed;
  END IF;

  WITH candidate_orgs AS (
    SELECT org_users.org_id
    FROM "public"."org_users"
    WHERE org_users.user_id = v_auth_user_id
      AND org_users.app_id IS NULL
      AND org_users.channel_id IS NULL

    UNION

    SELECT role_bindings.org_id
    FROM "public"."role_bindings"
    WHERE role_bindings.principal_type = "public"."rbac_principal_user"()
      AND role_bindings.principal_id = v_auth_user_id
      AND role_bindings.scope_type = "public"."rbac_scope_org"()
      AND role_bindings.org_id IS NOT NULL
      AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())

    UNION

    SELECT role_bindings.org_id
    FROM "public"."group_members"
    INNER JOIN "public"."groups"
      ON groups.id = group_members.group_id
    INNER JOIN "public"."role_bindings"
      ON role_bindings.principal_type = "public"."rbac_principal_group"()
      AND role_bindings.principal_id = group_members.group_id
      AND role_bindings.scope_type = "public"."rbac_scope_org"()
      AND role_bindings.org_id = groups.org_id
    WHERE group_members.user_id = v_auth_user_id
      AND role_bindings.org_id IS NOT NULL
      AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())
  )
  SELECT COALESCE(array_agg(DISTINCT candidate_orgs.org_id), '{}'::uuid[])
  INTO v_allowed
  FROM candidate_orgs
  WHERE "public"."rbac_check_permission_direct"(
    v_permission,
    v_auth_user_id,
    candidate_orgs.org_id,
    NULL::character varying,
    NULL::bigint,
    NULL::text
  );

  RETURN v_allowed;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."orgs_readable_org_ids"()
RETURNS "uuid"[]
LANGUAGE "sql" STABLE SECURITY DEFINER
SET "search_path" TO ''
AS $$
  SELECT "public"."orgs_with_min_right"('read'::"public"."user_min_right")
$$;

CREATE OR REPLACE FUNCTION "public"."org_member_readable_org_ids"()
RETURNS "uuid"[]
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_auth_user_id uuid;
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
  v_permission text;
  v_allowed uuid[] := '{}'::uuid[];
BEGIN
  SELECT "auth"."uid"() INTO v_auth_user_id;
  SELECT "public"."get_apikey_header"() INTO v_api_key_text;
  v_permission := "public"."rbac_permission_for_legacy"('read'::"public"."user_min_right", "public"."rbac_scope_org"());

  IF v_api_key_text IS NOT NULL THEN
    SELECT *
    FROM "public"."find_apikey_by_value"(v_api_key_text)
    INTO v_api_key;

    IF v_api_key.id IS NOT NULL AND NOT "public"."is_apikey_expired"(v_api_key.expires_at) THEN
      SELECT COALESCE(array_agg(DISTINCT candidate_orgs.org_id), '{}'::uuid[])
      INTO v_allowed
      FROM (
        SELECT role_bindings.org_id
        FROM "public"."role_bindings"
        WHERE role_bindings.principal_type = "public"."rbac_principal_apikey"()
          AND role_bindings.principal_id = v_api_key.rbac_id
          AND role_bindings.scope_type = "public"."rbac_scope_org"()
          AND role_bindings.org_id IS NOT NULL
          AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())
      ) candidate_orgs
      WHERE "public"."rbac_check_permission_direct"(
        v_permission,
        v_api_key.user_id,
        candidate_orgs.org_id,
        NULL::character varying,
        NULL::bigint,
        v_api_key_text
      )
        AND EXISTS (
          SELECT 1
          FROM "public"."org_users"
          WHERE org_users.user_id = v_api_key.user_id
            AND org_users.org_id = candidate_orgs.org_id
        );

      RETURN v_allowed;
    END IF;

    IF v_auth_user_id IS NULL THEN
      RETURN v_allowed;
    END IF;
  END IF;

  IF v_auth_user_id IS NULL THEN
    RETURN v_allowed;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT org_users.org_id), '{}'::uuid[])
  INTO v_allowed
  FROM "public"."org_users"
  WHERE org_users.user_id = v_auth_user_id
    AND "public"."rbac_check_permission_direct"(
      v_permission,
      v_auth_user_id,
      org_users.org_id,
      NULL::character varying,
      NULL::bigint,
      NULL::text
    );

  RETURN v_allowed;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."app_versions_readable_app_ids"()
RETURNS character varying[]
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
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
  SELECT "auth"."uid"() INTO v_user_id;
  SELECT "public"."get_apikey_header"() INTO v_api_key_text;

  IF v_api_key_text IS NOT NULL THEN
    SELECT * INTO v_api_key
    FROM "public"."find_apikey_by_value"(v_api_key_text)
    LIMIT 1;

    IF v_api_key.id IS NOT NULL AND NOT "public"."is_apikey_expired"(v_api_key.expires_at) THEN
      v_user_id := v_api_key.user_id;
      v_principal_type := "public"."rbac_principal_apikey"();
      v_principal_id := v_api_key.rbac_id;
    ELSE
      v_api_key_text := NULL;

      IF v_user_id IS NULL THEN
        RETURN v_allowed;
      END IF;

      v_principal_type := "public"."rbac_principal_user"();
      v_principal_id := v_user_id;
    END IF;
  ELSIF v_user_id IS NOT NULL THEN
    v_principal_type := "public"."rbac_principal_user"();
    v_principal_id := v_user_id;
  ELSE
    RETURN v_allowed;
  END IF;

  IF v_principal_id IS NULL THEN
    RETURN v_allowed;
  END IF;

  WITH RECURSIVE direct_bindings AS (
    SELECT rb.role_id, rb.scope_type, rb.org_id, rb.app_id
    FROM "public"."role_bindings" rb
    WHERE rb.principal_type = v_principal_type
      AND rb.principal_id = v_principal_id
      AND rb.scope_type IN ("public"."rbac_scope_org"(), "public"."rbac_scope_app"())
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())

    UNION

    SELECT rb.role_id, rb.scope_type, rb.org_id, rb.app_id
    FROM "public"."group_members" gm
    INNER JOIN "public"."groups" g ON g.id = gm.group_id
    INNER JOIN "public"."role_bindings" rb
      ON rb.principal_type = "public"."rbac_principal_group"()
      AND rb.principal_id = gm.group_id
      AND rb.org_id = g.org_id
    WHERE v_principal_type = "public"."rbac_principal_user"()
      AND gm.user_id = v_principal_id
      AND rb.scope_type IN ("public"."rbac_scope_org"(), "public"."rbac_scope_app"())
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
    INNER JOIN "public"."role_hierarchy"
      ON role_hierarchy.parent_role_id = role_closure.effective_role_id
    INNER JOIN "public"."roles" child_role
      ON child_role.id = role_hierarchy.child_role_id
      AND child_role.scope_type = role_closure.scope_type
  ),
  readable_scopes AS (
    SELECT DISTINCT role_closure.scope_type, role_closure.org_id, role_closure.app_id
    FROM role_closure
    INNER JOIN "public"."role_permissions"
      ON role_permissions.role_id = role_closure.effective_role_id
    INNER JOIN "public"."permissions"
      ON permissions.id = role_permissions.permission_id
    WHERE permissions.key = "public"."rbac_perm_app_read"()
  ),
  legacy_readable_scopes AS (
    SELECT
      CASE
        WHEN org_users.app_id IS NULL THEN "public"."rbac_scope_org"()
        ELSE "public"."rbac_scope_app"()
      END AS scope_type,
      org_users.org_id,
      apps.id AS app_id
    FROM "public"."org_users"
    LEFT JOIN "public"."apps"
      ON apps.app_id = org_users.app_id
      AND apps.owner_org = org_users.org_id
    WHERE v_api_key_text IS NULL
      AND v_user_id IS NOT NULL
      AND org_users.user_id = v_user_id
      AND org_users.user_right >= 'read'::"public"."user_min_right"
      AND org_users.channel_id IS NULL
  ),
  scoped_apps AS (
    SELECT apps.app_id, apps.owner_org
    FROM readable_scopes
    INNER JOIN "public"."apps"
      ON apps.owner_org = readable_scopes.org_id
    WHERE readable_scopes.scope_type = "public"."rbac_scope_org"()

    UNION

    SELECT apps.app_id, apps.owner_org
    FROM readable_scopes
    INNER JOIN "public"."apps"
      ON apps.id = readable_scopes.app_id
      AND apps.owner_org = readable_scopes.org_id
    WHERE readable_scopes.scope_type = "public"."rbac_scope_app"()
      AND readable_scopes.app_id IS NOT NULL

    UNION

    SELECT apps.app_id, apps.owner_org
    FROM legacy_readable_scopes
    INNER JOIN "public"."apps"
      ON apps.owner_org = legacy_readable_scopes.org_id
    WHERE legacy_readable_scopes.scope_type = "public"."rbac_scope_org"()

    UNION

    SELECT apps.app_id, apps.owner_org
    FROM legacy_readable_scopes
    INNER JOIN "public"."apps"
      ON apps.id = legacy_readable_scopes.app_id
      AND apps.owner_org = legacy_readable_scopes.org_id
    WHERE legacy_readable_scopes.scope_type = "public"."rbac_scope_app"()
      AND legacy_readable_scopes.app_id IS NOT NULL
  ),
  candidate_orgs AS (
    SELECT DISTINCT scoped_apps.owner_org
    FROM scoped_apps
  ),
  readable_orgs AS (
    SELECT orgs.id
    FROM candidate_orgs
    INNER JOIN "public"."orgs" ON orgs.id = candidate_orgs.owner_org
    WHERE (
        orgs.enforcing_2fa IS NOT TRUE
        OR (v_user_id IS NOT NULL AND "public"."has_2fa_enabled"(v_user_id))
      )
      AND "public"."user_meets_password_policy"(v_user_id, orgs.id) IS DISTINCT FROM false
  )
  SELECT COALESCE(array_agg(DISTINCT scoped_apps.app_id), '{}'::character varying[])
  INTO v_allowed
  FROM scoped_apps
  INNER JOIN readable_orgs ON readable_orgs.id = scoped_apps.owner_org;

  RETURN v_allowed;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."readable_app_version_ids"()
RETURNS bigint[]
LANGUAGE "sql" STABLE SECURITY DEFINER
SET "search_path" TO ''
AS $$
  SELECT COALESCE(array_agg(DISTINCT app_versions.id), '{}'::bigint[])
  FROM "public"."app_versions"
  WHERE app_versions.app_id = ANY(
    COALESCE((SELECT "public"."app_versions_readable_app_ids"()), '{}'::character varying[])
  )
$$;

CREATE OR REPLACE FUNCTION "public"."readable_group_ids"()
RETURNS "uuid"[]
LANGUAGE "sql" STABLE SECURITY DEFINER
SET "search_path" TO ''
AS $$
  SELECT COALESCE(array_agg(DISTINCT allowed_groups.group_id), '{}'::uuid[])
  FROM (
    SELECT group_members.group_id
    FROM "public"."group_members"
    WHERE group_members.user_id = (SELECT "auth"."uid"())

    UNION

    SELECT groups.id AS group_id
    FROM "public"."groups"
    WHERE groups.org_id = ANY(
      COALESCE((SELECT "public"."orgs_with_min_right"('admin'::"public"."user_min_right")), '{}'::uuid[])
    )
  ) allowed_groups
$$;

CREATE OR REPLACE FUNCTION "public"."readable_org_customer_ids"()
RETURNS "text"[]
LANGUAGE "sql" STABLE SECURITY DEFINER
SET "search_path" TO ''
AS $$
  SELECT COALESCE(array_agg(DISTINCT orgs.customer_id::text), '{}'::text[])
  FROM "public"."orgs"
  WHERE orgs.customer_id IS NOT NULL
    AND orgs.id = ANY(COALESCE((SELECT "public"."orgs_readable_org_ids"()), '{}'::uuid[]))
$$;

CREATE OR REPLACE FUNCTION "public"."current_user_member_org_ids"()
RETURNS "uuid"[]
LANGUAGE "sql" STABLE SECURITY DEFINER
SET "search_path" TO ''
AS $$
  SELECT COALESCE(array_agg(DISTINCT org_users.org_id), '{}'::uuid[])
  FROM "public"."org_users"
  WHERE org_users.user_id = (SELECT "auth"."uid"())
$$;

CREATE OR REPLACE FUNCTION "public"."role_bindings_readable_ids"()
RETURNS "uuid"[]
LANGUAGE "sql" STABLE SECURITY DEFINER
SET "search_path" TO ''
AS $$
  WITH actor AS (
    SELECT (SELECT "auth"."uid"()) AS user_id
  ),
  candidate_orgs AS (
    SELECT org_users.org_id
    FROM "public"."org_users"
    INNER JOIN actor ON actor.user_id IS NOT NULL
    WHERE org_users.user_id = actor.user_id
      AND org_users.org_id IS NOT NULL

    UNION

    SELECT role_bindings.org_id
    FROM "public"."role_bindings"
    INNER JOIN actor ON actor.user_id IS NOT NULL
    WHERE role_bindings.principal_type = "public"."rbac_principal_user"()
      AND role_bindings.principal_id = actor.user_id
      AND role_bindings.scope_type = "public"."rbac_scope_org"()
      AND role_bindings.org_id IS NOT NULL
      AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())

    UNION

    SELECT role_bindings.org_id
    FROM "public"."group_members"
    INNER JOIN actor ON actor.user_id IS NOT NULL
    INNER JOIN "public"."groups" ON groups.id = group_members.group_id
    INNER JOIN "public"."role_bindings"
      ON role_bindings.principal_type = "public"."rbac_principal_group"()
      AND role_bindings.principal_id = group_members.group_id
      AND role_bindings.scope_type = "public"."rbac_scope_org"()
      AND role_bindings.org_id = groups.org_id
    WHERE group_members.user_id = actor.user_id
      AND role_bindings.org_id IS NOT NULL
      AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())
  ),
  admin_orgs AS (
    SELECT DISTINCT candidate_orgs.org_id
    FROM candidate_orgs
    INNER JOIN actor ON actor.user_id IS NOT NULL
    WHERE "public"."rbac_check_permission_direct"(
      "public"."rbac_perm_org_update_user_roles"(),
      actor.user_id,
      candidate_orgs.org_id,
      NULL::character varying,
      NULL::bigint,
      NULL::text
    )
  ),
  candidate_apps AS (
    SELECT apps.id, apps.app_id, apps.owner_org
    FROM "public"."apps"
    WHERE apps.owner_org IN (SELECT admin_orgs.org_id FROM admin_orgs)

    UNION

    SELECT apps.id, apps.app_id, apps.owner_org
    FROM "public"."role_bindings"
    INNER JOIN actor ON actor.user_id IS NOT NULL
    INNER JOIN "public"."apps"
      ON apps.id = role_bindings.app_id
      AND apps.owner_org = role_bindings.org_id
    WHERE role_bindings.principal_type = "public"."rbac_principal_user"()
      AND role_bindings.principal_id = actor.user_id
      AND role_bindings.scope_type = "public"."rbac_scope_app"()
      AND role_bindings.app_id IS NOT NULL
      AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())

    UNION

    SELECT apps.id, apps.app_id, apps.owner_org
    FROM "public"."group_members"
    INNER JOIN actor ON actor.user_id IS NOT NULL
    INNER JOIN "public"."groups" ON groups.id = group_members.group_id
    INNER JOIN "public"."role_bindings"
      ON role_bindings.principal_type = "public"."rbac_principal_group"()
      AND role_bindings.principal_id = group_members.group_id
      AND role_bindings.scope_type = "public"."rbac_scope_app"()
      AND role_bindings.org_id = groups.org_id
    INNER JOIN "public"."apps"
      ON apps.id = role_bindings.app_id
      AND apps.owner_org = role_bindings.org_id
    WHERE group_members.user_id = actor.user_id
      AND role_bindings.app_id IS NOT NULL
      AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())
  ),
  manager_apps AS (
    SELECT DISTINCT candidate_apps.id, candidate_apps.app_id, candidate_apps.owner_org
    FROM candidate_apps
    INNER JOIN actor ON actor.user_id IS NOT NULL
    WHERE "public"."rbac_check_permission_direct"(
      "public"."rbac_perm_app_update_user_roles"(),
      actor.user_id,
      candidate_apps.owner_org,
      candidate_apps.app_id,
      NULL::bigint,
      NULL::text
    )
  ),
  member_apps AS (
    SELECT DISTINCT candidate_apps.id
    FROM candidate_apps
    INNER JOIN actor ON actor.user_id IS NOT NULL
    WHERE EXISTS (
      SELECT 1
      FROM "public"."role_bindings"
      WHERE role_bindings.principal_type = "public"."rbac_principal_user"()
        AND role_bindings.principal_id = actor.user_id
        AND role_bindings.scope_type = "public"."rbac_scope_app"()
        AND role_bindings.app_id = candidate_apps.id
        AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())
    )
      OR EXISTS (
        SELECT 1
        FROM "public"."group_members"
        INNER JOIN "public"."groups" ON groups.id = group_members.group_id
        INNER JOIN "public"."role_bindings"
          ON role_bindings.principal_type = "public"."rbac_principal_group"()
          AND role_bindings.principal_id = group_members.group_id
          AND role_bindings.scope_type = "public"."rbac_scope_app"()
          AND role_bindings.org_id = groups.org_id
        WHERE group_members.user_id = actor.user_id
          AND role_bindings.app_id = candidate_apps.id
          AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())
      )
  ),
  manager_channels AS (
    SELECT DISTINCT channels.rbac_id AS channel_id
    FROM "public"."channels"
    INNER JOIN manager_apps ON manager_apps.app_id = channels.app_id
    WHERE channels.rbac_id IS NOT NULL
  )
  SELECT COALESCE(array_agg(DISTINCT role_bindings.id), '{}'::uuid[])
  FROM "public"."role_bindings"
  WHERE role_bindings.org_id IN (SELECT admin_orgs.org_id FROM admin_orgs)
    OR (
      role_bindings.scope_type = "public"."rbac_scope_app"()
      AND role_bindings.app_id IN (SELECT manager_apps.id FROM manager_apps)
    )
    OR (
      role_bindings.scope_type = "public"."rbac_scope_app"()
      AND role_bindings.app_id IN (SELECT member_apps.id FROM member_apps)
    )
    OR (
      role_bindings.scope_type = "public"."rbac_scope_channel"()
      AND role_bindings.channel_id IN (SELECT manager_channels.channel_id FROM manager_channels)
    )
$$;

CREATE OR REPLACE FUNCTION "public"."channel_permission_override_readable_channel_ids"()
RETURNS bigint[]
LANGUAGE "sql" STABLE SECURITY DEFINER
SET "search_path" TO ''
AS $$
  WITH actor AS (
    SELECT (SELECT "auth"."uid"()) AS user_id
  ),
  candidate_apps AS (
    SELECT apps.app_id, apps.owner_org
    FROM "public"."org_users"
    INNER JOIN actor ON actor.user_id IS NOT NULL
    INNER JOIN "public"."apps" ON apps.owner_org = org_users.org_id
    WHERE org_users.user_id = actor.user_id
      AND org_users.app_id IS NULL
      AND org_users.channel_id IS NULL

    UNION

    SELECT apps.app_id, apps.owner_org
    FROM "public"."org_users"
    INNER JOIN actor ON actor.user_id IS NOT NULL
    INNER JOIN "public"."apps"
      ON apps.app_id = org_users.app_id
      AND apps.owner_org = org_users.org_id
    WHERE org_users.user_id = actor.user_id
      AND org_users.app_id IS NOT NULL
      AND org_users.channel_id IS NULL

    UNION

    SELECT apps.app_id, apps.owner_org
    FROM "public"."role_bindings"
    INNER JOIN actor ON actor.user_id IS NOT NULL
    INNER JOIN "public"."apps" ON apps.owner_org = role_bindings.org_id
    WHERE role_bindings.principal_type = "public"."rbac_principal_user"()
      AND role_bindings.principal_id = actor.user_id
      AND role_bindings.scope_type = "public"."rbac_scope_org"()
      AND role_bindings.org_id IS NOT NULL
      AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())

    UNION

    SELECT apps.app_id, apps.owner_org
    FROM "public"."role_bindings"
    INNER JOIN actor ON actor.user_id IS NOT NULL
    INNER JOIN "public"."apps"
      ON apps.id = role_bindings.app_id
      AND apps.owner_org = role_bindings.org_id
    WHERE role_bindings.principal_type = "public"."rbac_principal_user"()
      AND role_bindings.principal_id = actor.user_id
      AND role_bindings.scope_type = "public"."rbac_scope_app"()
      AND role_bindings.app_id IS NOT NULL
      AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())

    UNION

    SELECT apps.app_id, apps.owner_org
    FROM "public"."group_members"
    INNER JOIN actor ON actor.user_id IS NOT NULL
    INNER JOIN "public"."groups" ON groups.id = group_members.group_id
    INNER JOIN "public"."role_bindings"
      ON role_bindings.principal_type = "public"."rbac_principal_group"()
      AND role_bindings.principal_id = group_members.group_id
      AND role_bindings.org_id = groups.org_id
    INNER JOIN "public"."apps" ON apps.owner_org = role_bindings.org_id
    WHERE group_members.user_id = actor.user_id
      AND role_bindings.scope_type = "public"."rbac_scope_org"()
      AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())

    UNION

    SELECT apps.app_id, apps.owner_org
    FROM "public"."group_members"
    INNER JOIN actor ON actor.user_id IS NOT NULL
    INNER JOIN "public"."groups" ON groups.id = group_members.group_id
    INNER JOIN "public"."role_bindings"
      ON role_bindings.principal_type = "public"."rbac_principal_group"()
      AND role_bindings.principal_id = group_members.group_id
      AND role_bindings.scope_type = "public"."rbac_scope_app"()
      AND role_bindings.org_id = groups.org_id
    INNER JOIN "public"."apps"
      ON apps.id = role_bindings.app_id
      AND apps.owner_org = role_bindings.org_id
    WHERE group_members.user_id = actor.user_id
      AND role_bindings.app_id IS NOT NULL
      AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())
  ),
  manager_apps AS (
    SELECT DISTINCT candidate_apps.app_id
    FROM candidate_apps
    INNER JOIN actor ON actor.user_id IS NOT NULL
    WHERE "public"."rbac_check_permission_direct"(
      "public"."rbac_perm_app_update_user_roles"(),
      actor.user_id,
      candidate_apps.owner_org,
      candidate_apps.app_id,
      NULL::bigint,
      NULL::text
    )
  )
  SELECT COALESCE(array_agg(DISTINCT channels.id), '{}'::bigint[])
  FROM "public"."channels"
  WHERE channels.app_id IN (SELECT manager_apps.app_id FROM manager_apps)
$$;

ALTER FUNCTION "public"."orgs_with_min_right"("public"."user_min_right") OWNER TO "postgres";
ALTER FUNCTION "public"."orgs_readable_org_ids"() OWNER TO "postgres";
ALTER FUNCTION "public"."org_member_readable_org_ids"() OWNER TO "postgres";
ALTER FUNCTION "public"."app_versions_readable_app_ids"() OWNER TO "postgres";
ALTER FUNCTION "public"."readable_app_version_ids"() OWNER TO "postgres";
ALTER FUNCTION "public"."readable_group_ids"() OWNER TO "postgres";
ALTER FUNCTION "public"."readable_org_customer_ids"() OWNER TO "postgres";
ALTER FUNCTION "public"."current_user_member_org_ids"() OWNER TO "postgres";
ALTER FUNCTION "public"."role_bindings_readable_ids"() OWNER TO "postgres";
ALTER FUNCTION "public"."channel_permission_override_readable_channel_ids"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."orgs_with_min_right"("public"."user_min_right") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."orgs_readable_org_ids"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."org_member_readable_org_ids"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."readable_app_version_ids"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."app_versions_readable_app_ids"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."readable_group_ids"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."readable_org_customer_ids"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."current_user_member_org_ids"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."role_bindings_readable_ids"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."channel_permission_override_readable_channel_ids"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."orgs_with_min_right"("public"."user_min_right") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."orgs_with_min_right"("public"."user_min_right") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."orgs_with_min_right"("public"."user_min_right") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."orgs_readable_org_ids"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."orgs_readable_org_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."orgs_readable_org_ids"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."org_member_readable_org_ids"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."org_member_readable_org_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."org_member_readable_org_ids"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."app_versions_readable_app_ids"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."app_versions_readable_app_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."app_versions_readable_app_ids"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."readable_app_version_ids"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."readable_app_version_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."readable_app_version_ids"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."readable_group_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."readable_group_ids"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."readable_org_customer_ids"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."readable_org_customer_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."readable_org_customer_ids"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."current_user_member_org_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."current_user_member_org_ids"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."role_bindings_readable_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."role_bindings_readable_ids"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."channel_permission_override_readable_channel_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."channel_permission_override_readable_channel_ids"() TO "service_role";

ALTER FUNCTION "public"."app_versions_readable_app_ids"() STABLE;

COMMENT ON FUNCTION "public"."orgs_with_min_right"("public"."user_min_right") IS
'Returns org IDs matching a minimum right for the current authenticated user or Capgo API key. API-key requests only use org-scoped API-key bindings, then exact-check each candidate with the existing RBAC permission path.';
COMMENT ON FUNCTION "public"."orgs_readable_org_ids"() IS
'Returns org IDs readable by the current authenticated user or Capgo API key. This is used by orgs RLS so unfiltered PostgREST requests compute access once and then filter by orgs.id instead of doing per-row auth work.';
COMMENT ON FUNCTION "public"."app_versions_readable_app_ids"() IS
'Returns app IDs readable by the current authenticated user or Capgo API key. Normal read RLS uses this statement-level helper instead of checking app RBAC once per candidate row; targeted write RLS keeps the indexed row helper.';
COMMENT ON FUNCTION "public"."org_member_readable_org_ids"() IS
'Returns org IDs where the current authenticated user or Capgo API-key owner has a membership row in the org and read rights. org_users RLS uses this narrower helper so org read access does not expose membership rows for non-members.';
COMMENT ON FUNCTION "public"."readable_app_version_ids"() IS
'Returns app_version IDs readable by the current authenticated user or Capgo API key. Manifest RLS uses this statement-level helper instead of checking every manifest row through app_versions.';
COMMENT ON FUNCTION "public"."readable_group_ids"() IS
'Returns group IDs readable by the current authenticated user. Group RLS uses this statement-level helper instead of checking group membership and org admin rights per row.';
COMMENT ON FUNCTION "public"."readable_org_customer_ids"() IS
'Returns Stripe customer IDs for readable orgs. Stripe RLS uses this statement-level helper instead of joining orgs and running org authorization per row.';
COMMENT ON FUNCTION "public"."current_user_member_org_ids"() IS
'Returns org IDs where the current authenticated user has an org membership. Deploy history RLS uses this statement-level helper instead of checking org_users for every deploy_history row.';
COMMENT ON FUNCTION "public"."role_bindings_readable_ids"() IS
'Returns role binding IDs visible to the current authenticated user from set-based admin, app, and channel scope calculations. Role bindings RLS uses this statement-level helper instead of calling RBAC helper functions per row.';
COMMENT ON FUNCTION "public"."channel_permission_override_readable_channel_ids"() IS
'Returns channel IDs whose permission overrides can be managed by the current authenticated user. Channel override RLS uses this statement-level helper instead of checking app role permissions for every override row.';

DROP POLICY IF EXISTS "Allow select for auth, api keys (read+)"
ON "public"."orgs";

CREATE POLICY "Allow select for auth, api keys (read+)"
ON "public"."orgs"
FOR SELECT
TO "anon", "authenticated"
USING (
  ((SELECT "auth"."uid"()) IS NOT NULL OR (SELECT "public"."get_apikey_header"()) IS NOT NULL)
  AND "id" = ANY(COALESCE((SELECT "public"."orgs_readable_org_ids"()), '{}'::uuid[]))
);

DROP POLICY IF EXISTS "Allow for auth, api keys (read+)"
ON "public"."apps";

CREATE POLICY "Allow for auth, api keys (read+)"
ON "public"."apps"
FOR SELECT
TO "anon", "authenticated"
USING (
  "app_id" = ANY(COALESCE((SELECT "public"."app_versions_readable_app_ids"()), '{}'::character varying[]))
);

DROP POLICY IF EXISTS "Allow for auth, api keys (read+)"
ON "public"."app_versions";

CREATE POLICY "Allow for auth, api keys (read+)"
ON "public"."app_versions"
FOR SELECT
TO "anon", "authenticated"
USING (
  CASE
    WHEN COALESCE((SELECT current_setting('request.method', true)), '') = ANY('{PATCH,PUT,DELETE}'::text[])
      THEN (
        (((SELECT "auth"."uid"()) IS NOT NULL) OR ((SELECT "public"."get_apikey_header"()) IS NOT NULL))
        AND EXISTS (
          SELECT 1
          FROM (
            SELECT
              "auth"."uid"() AS "uid",
              "public"."get_apikey_header"() AS "apikey"
          ) "identity"
          WHERE (
            "identity"."uid" IS NOT NULL
            AND "public"."app_versions_has_app_permission"(
              'read'::"public"."user_min_right",
              "owner_org",
              "app_id",
              "identity"."uid",
              NULL::text
            )
          )
          OR (
            "identity"."uid" IS NULL
            AND "identity"."apikey" IS NOT NULL
            AND "public"."app_versions_has_app_permission"(
              'read'::"public"."user_min_right",
              "owner_org",
              "app_id",
              NULL::uuid,
              "identity"."apikey"
            )
          )
        )
      )
    ELSE "app_id" = ANY(COALESCE((SELECT "public"."app_versions_readable_app_ids"()), '{}'::character varying[]))
  END
);

DROP POLICY IF EXISTS "Allow read for auth (read+)"
ON "public"."app_versions_meta";

CREATE POLICY "Allow read for auth (read+)"
ON "public"."app_versions_meta"
FOR SELECT
TO "anon", "authenticated"
USING (
  "app_id" = ANY(COALESCE((SELECT "public"."app_versions_readable_app_ids"()), '{}'::character varying[]))
);

DROP POLICY IF EXISTS "Allow org members to select build_logs"
ON "public"."build_logs";

CREATE POLICY "Allow org members to select build_logs"
ON "public"."build_logs"
FOR SELECT
TO "anon", "authenticated"
USING (
  "org_id" = ANY(COALESCE((SELECT "public"."orgs_readable_org_ids"()), '{}'::uuid[]))
  OR "app_id" = ANY(COALESCE((SELECT "public"."app_versions_readable_app_ids"()), '{}'::character varying[]))
);

DROP POLICY IF EXISTS "Allow org members to select build_requests"
ON "public"."build_requests";

CREATE POLICY "Allow org members to select build_requests"
ON "public"."build_requests"
FOR SELECT
TO "anon", "authenticated"
USING (
  "app_id" = ANY(COALESCE((SELECT "public"."app_versions_readable_app_ids"()), '{}'::character varying[]))
);

DROP POLICY IF EXISTS "compatibility_events_select"
ON "public"."compatibility_events";

CREATE POLICY "compatibility_events_select"
ON "public"."compatibility_events"
FOR SELECT
TO "authenticated"
USING (
  "app_id" = ANY(COALESCE((SELECT "public"."app_versions_readable_app_ids"()), '{}'::character varying[]))
);

DROP POLICY IF EXISTS "Allow read for auth, api keys (read+)"
ON "public"."channel_devices";

CREATE POLICY "Allow read for auth, api keys (read+)"
ON "public"."channel_devices"
FOR SELECT
TO "anon", "authenticated"
USING (
  "app_id" = ANY(COALESCE((SELECT "public"."app_versions_readable_app_ids"()), '{}'::character varying[]))
);

DROP POLICY IF EXISTS "channel_permission_overrides_admin_select"
ON "public"."channel_permission_overrides";

CREATE POLICY "channel_permission_overrides_admin_select"
ON "public"."channel_permission_overrides"
FOR SELECT
TO "authenticated"
USING (
  "channel_id" = ANY(COALESCE((SELECT "public"."channel_permission_override_readable_channel_ids"()), '{}'::bigint[]))
);

DROP POLICY IF EXISTS "Allow select for auth, api keys (read+)"
ON "public"."channels";

CREATE POLICY "Allow select for auth, api keys (read+)"
ON "public"."channels"
FOR SELECT
TO "anon", "authenticated"
USING (
  "app_id" = ANY(COALESCE((SELECT "public"."app_versions_readable_app_ids"()), '{}'::character varying[]))
);

DROP POLICY IF EXISTS "Allow read for auth (read+)"
ON "public"."daily_bandwidth";

CREATE POLICY "Allow read for auth (read+)"
ON "public"."daily_bandwidth"
FOR SELECT
TO "anon", "authenticated"
USING (
  "app_id" = ANY(COALESCE((SELECT "public"."app_versions_readable_app_ids"()), '{}'::character varying[]))
);

DROP POLICY IF EXISTS "Allow org members to select daily_build_time"
ON "public"."daily_build_time";

CREATE POLICY "Allow org members to select daily_build_time"
ON "public"."daily_build_time"
FOR SELECT
TO "anon", "authenticated"
USING (
  "app_id" = ANY(COALESCE((SELECT "public"."app_versions_readable_app_ids"()), '{}'::character varying[]))
);

DROP POLICY IF EXISTS "Allow read for auth (read+)"
ON "public"."daily_mau";

CREATE POLICY "Allow read for auth (read+)"
ON "public"."daily_mau"
FOR SELECT
TO "anon", "authenticated"
USING (
  "app_id" = ANY(COALESCE((SELECT "public"."app_versions_readable_app_ids"()), '{}'::character varying[]))
);

DROP POLICY IF EXISTS "Allow read for auth (read+)"
ON "public"."daily_storage";

CREATE POLICY "Allow read for auth (read+)"
ON "public"."daily_storage"
FOR SELECT
TO "anon", "authenticated"
USING (
  "app_id" = ANY(COALESCE((SELECT "public"."app_versions_readable_app_ids"()), '{}'::character varying[]))
);

DROP POLICY IF EXISTS "Allow read for auth (read+)"
ON "public"."daily_storage_hourly";

CREATE POLICY "Allow read for auth (read+)"
ON "public"."daily_storage_hourly"
FOR SELECT
TO "anon", "authenticated"
USING (
  "app_id" = ANY(COALESCE((SELECT "public"."app_versions_readable_app_ids"()), '{}'::character varying[]))
);

DROP POLICY IF EXISTS "Allow read for auth (read+)"
ON "public"."daily_version";

CREATE POLICY "Allow read for auth (read+)"
ON "public"."daily_version"
FOR SELECT
TO "anon", "authenticated"
USING (
  "app_id" = ANY(COALESCE((SELECT "public"."app_versions_readable_app_ids"()), '{}'::character varying[]))
);

DROP POLICY IF EXISTS "Allow org member to select devices"
ON "public"."devices";

CREATE POLICY "Allow org member to select devices"
ON "public"."devices"
FOR SELECT
TO "anon", "authenticated"
USING (
  "app_id" = ANY(COALESCE((SELECT "public"."app_versions_readable_app_ids"()), '{}'::character varying[]))
);

DROP POLICY IF EXISTS "Allow users to view deploy history for their org"
ON "public"."deploy_history";

CREATE POLICY "Allow users to view deploy history for their org"
ON "public"."deploy_history"
FOR SELECT
TO "authenticated"
USING (
  "owner_org" = ANY(COALESCE((SELECT "public"."current_user_member_org_ids"()), '{}'::uuid[]))
);

DROP POLICY IF EXISTS "groups_select"
ON "public"."groups";

CREATE POLICY "groups_select"
ON "public"."groups"
FOR SELECT
TO "authenticated"
USING (
  "id" = ANY(COALESCE((SELECT "public"."readable_group_ids"()), '{}'::uuid[]))
);

DROP POLICY IF EXISTS "group_members_select"
ON "public"."group_members";

CREATE POLICY "group_members_select"
ON "public"."group_members"
FOR SELECT
TO "authenticated"
USING (
  "group_id" = ANY(COALESCE((SELECT "public"."readable_group_ids"()), '{}'::uuid[]))
);

DROP POLICY IF EXISTS "Allow select for auth, api keys (read+)"
ON "public"."manifest";

CREATE POLICY "Allow select for auth, api keys (read+)"
ON "public"."manifest"
FOR SELECT
TO "anon", "authenticated"
USING (
  "app_version_id" = ANY(COALESCE((SELECT "public"."readable_app_version_ids"()), '{}'::bigint[]))
);

DROP POLICY IF EXISTS "Allow member and owner to select"
ON "public"."org_users";

CREATE POLICY "Allow member and owner to select"
ON "public"."org_users"
FOR SELECT
TO "anon", "authenticated"
USING (
  "org_id" = ANY(COALESCE((SELECT "public"."org_member_readable_org_ids"()), '{}'::uuid[]))
);

DROP POLICY IF EXISTS "Allow viewing role bindings with permission"
ON "public"."role_bindings";

DROP POLICY IF EXISTS "role_bindings_select"
ON "public"."role_bindings";

CREATE POLICY "role_bindings_select"
ON "public"."role_bindings"
FOR SELECT
TO "authenticated"
USING (
  "id" = ANY(COALESCE((SELECT "public"."role_bindings_readable_ids"()), '{}'::uuid[]))
);

DROP POLICY IF EXISTS "Allow admin to select webhooks"
ON "public"."webhooks";

CREATE POLICY "Allow admin to select webhooks"
ON "public"."webhooks"
FOR SELECT
TO "anon", "authenticated"
USING (
  "org_id" = ANY(COALESCE((SELECT "public"."orgs_with_min_right"('admin'::"public"."user_min_right")), '{}'::uuid[]))
);

DROP POLICY IF EXISTS "Allow org members to select webhook_deliveries"
ON "public"."webhook_deliveries";

CREATE POLICY "Allow org members to select webhook_deliveries"
ON "public"."webhook_deliveries"
FOR SELECT
TO "anon", "authenticated"
USING (
  "org_id" = ANY(COALESCE((SELECT "public"."orgs_readable_org_ids"()), '{}'::uuid[]))
);

DROP POLICY IF EXISTS "allow_org_admins_select_sso_providers"
ON "public"."sso_providers";

CREATE POLICY "allow_org_admins_select_sso_providers"
ON "public"."sso_providers"
FOR SELECT
TO "anon", "authenticated"
USING (
  "org_id" = ANY(COALESCE((SELECT "public"."orgs_with_min_right"('admin'::"public"."user_min_right")), '{}'::uuid[]))
);

DROP POLICY IF EXISTS "Allow read for auth (read+)"
ON "public"."stats";

CREATE POLICY "Allow read for auth (read+)"
ON "public"."stats"
FOR SELECT
TO "anon", "authenticated"
USING (
  "app_id" = ANY(COALESCE((SELECT "public"."app_versions_readable_app_ids"()), '{}'::character varying[]))
);

DROP POLICY IF EXISTS "Allow org member to select stripe_info"
ON "public"."stripe_info";

CREATE POLICY "Allow org member to select stripe_info"
ON "public"."stripe_info"
FOR SELECT
TO "anon", "authenticated"
USING (
  "customer_id" = ANY(COALESCE((SELECT "public"."readable_org_customer_ids"()), '{}'::text[]))
);
