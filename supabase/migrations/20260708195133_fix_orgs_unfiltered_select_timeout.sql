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

ALTER FUNCTION "public"."orgs_with_min_right"("public"."user_min_right") OWNER TO "postgres";
ALTER FUNCTION "public"."orgs_readable_org_ids"() OWNER TO "postgres";
ALTER FUNCTION "public"."org_member_readable_org_ids"() OWNER TO "postgres";
ALTER FUNCTION "public"."readable_app_version_ids"() OWNER TO "postgres";
ALTER FUNCTION "public"."readable_group_ids"() OWNER TO "postgres";
ALTER FUNCTION "public"."readable_org_customer_ids"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."orgs_with_min_right"("public"."user_min_right") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."orgs_readable_org_ids"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."org_member_readable_org_ids"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."readable_app_version_ids"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."readable_group_ids"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."readable_org_customer_ids"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."orgs_with_min_right"("public"."user_min_right") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."orgs_with_min_right"("public"."user_min_right") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."orgs_with_min_right"("public"."user_min_right") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."orgs_readable_org_ids"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."orgs_readable_org_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."orgs_readable_org_ids"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."org_member_readable_org_ids"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."org_member_readable_org_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."org_member_readable_org_ids"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."readable_app_version_ids"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."readable_app_version_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."readable_app_version_ids"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."readable_group_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."readable_group_ids"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."readable_org_customer_ids"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."readable_org_customer_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."readable_org_customer_ids"() TO "service_role";

COMMENT ON FUNCTION "public"."orgs_with_min_right"("public"."user_min_right") IS
'Returns org IDs matching a minimum right for the current authenticated user or Capgo API key. API-key requests only use org-scoped API-key bindings, then exact-check each candidate with the existing RBAC permission path.';
COMMENT ON FUNCTION "public"."orgs_readable_org_ids"() IS
'Returns org IDs readable by the current authenticated user or Capgo API key. This is used by orgs RLS so unfiltered PostgREST requests compute access once and then filter by orgs.id instead of doing per-row auth work.';
COMMENT ON FUNCTION "public"."org_member_readable_org_ids"() IS
'Returns org IDs where the current authenticated user or Capgo API-key owner has a membership row in the org and read rights. org_users RLS uses this narrower helper so org read access does not expose membership rows for non-members.';
COMMENT ON FUNCTION "public"."readable_app_version_ids"() IS
'Returns app_version IDs readable by the current authenticated user or Capgo API key. Manifest RLS uses this statement-level helper instead of checking every manifest row through app_versions.';
COMMENT ON FUNCTION "public"."readable_group_ids"() IS
'Returns group IDs readable by the current authenticated user. Group RLS uses this statement-level helper instead of checking group membership and org admin rights per row.';
COMMENT ON FUNCTION "public"."readable_org_customer_ids"() IS
'Returns Stripe customer IDs for readable orgs. Stripe RLS uses this statement-level helper instead of joining orgs and running org authorization per row.';

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

DROP POLICY IF EXISTS "Allow read for auth, api keys (read+)"
ON "public"."channel_devices";

CREATE POLICY "Allow read for auth, api keys (read+)"
ON "public"."channel_devices"
FOR SELECT
TO "anon", "authenticated"
USING (
  "app_id" = ANY(COALESCE((SELECT "public"."app_versions_readable_app_ids"()), '{}'::character varying[]))
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
