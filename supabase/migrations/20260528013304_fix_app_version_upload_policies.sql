COMMENT ON FUNCTION "public"."app_versions_readable_app_ids"() IS
'Returns app IDs whose bundle rows are readable by the current authenticated user or Capgo API key. The lookup starts from caller-scoped role bindings and expands role permissions set-wise for compatibility; targeted app_versions RLS checks use app_versions_has_app_permission instead.';

CREATE OR REPLACE FUNCTION "public"."find_apikey_by_value"("key_value" "text") RETURNS SETOF "public"."apikeys"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  apikey_row public.apikeys%ROWTYPE;
  key_value_hash text;
BEGIN
  IF key_value IS NULL OR key_value = '' THEN
    RETURN;
  END IF;

  key_value_hash := encode(extensions.digest(key_value, 'sha256'), 'hex');

  SELECT public.apikeys.*
  INTO apikey_row
  FROM public.apikeys
  WHERE public.apikeys.key_hash = key_value_hash
  LIMIT 1;

  IF apikey_row.id IS NULL THEN
    SELECT public.apikeys.*
    INTO apikey_row
    FROM public.apikeys
    WHERE public.apikeys.key = key_value
    LIMIT 1;
  END IF;

  IF apikey_row.id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.check_apikey_hashed_key_enforcement(apikey_row) THEN
    RETURN;
  END IF;

  RETURN NEXT apikey_row;
END;
$$;

ALTER FUNCTION "public"."find_apikey_by_value"("key_value" "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."find_apikey_by_value"("key_value" "text") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."find_apikey_by_value"("key_value" "text") TO "service_role";

COMMENT ON FUNCTION "public"."find_apikey_by_value"("key_value" "text") IS
'Resolves an API key by hashed key first and legacy plain key second. The two-step lookup keeps API-key RLS checks on indexed paths instead of a broad OR predicate.';

CREATE INDEX IF NOT EXISTS "idx_group_members_user_id_group_id"
ON "public"."group_members" ("user_id", "group_id");

CREATE OR REPLACE FUNCTION "public"."app_versions_has_app_permission"(
  "p_min_right" "public"."user_min_right",
  "p_owner_org" "uuid",
  "p_app_id" character varying,
  "p_user_id" "uuid",
  "p_apikey" "text"
)
RETURNS boolean
LANGUAGE "plpgsql" VOLATILE SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_user_id uuid := p_user_id;
  v_api_key public.apikeys%ROWTYPE;
  v_principal_type text;
  v_principal_id uuid;
  v_app_uuid uuid;
  v_app_owner_org uuid;
  v_permission text;
BEGIN
  IF p_min_right IS NULL OR p_owner_org IS NULL OR p_app_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT apps.id, apps.owner_org
  INTO v_app_uuid, v_app_owner_org
  FROM public.apps
  WHERE apps.app_id = p_app_id
  LIMIT 1;

  IF v_app_uuid IS NULL OR v_app_owner_org IS DISTINCT FROM p_owner_org THEN
    RETURN false;
  END IF;

  IF p_apikey IS NOT NULL THEN
    SELECT * INTO v_api_key
    FROM public.find_apikey_by_value(p_apikey)
    LIMIT 1;

    IF v_api_key.id IS NULL
      OR public.is_apikey_expired(v_api_key.expires_at)
      OR (p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM v_api_key.user_id)
    THEN
      RETURN false;
    END IF;

    v_user_id := v_api_key.user_id;
    v_principal_type := public.rbac_principal_apikey();
    v_principal_id := v_api_key.rbac_id;
  ELSE
    IF v_user_id IS NULL THEN
      RETURN false;
    END IF;

    v_principal_type := public.rbac_principal_user();
    v_principal_id := v_user_id;
  END IF;

  IF v_principal_id IS NULL OR v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF (SELECT orgs.enforcing_2fa FROM public.orgs WHERE orgs.id = v_app_owner_org)
    AND NOT public.has_2fa_enabled(v_user_id)
  THEN
    RETURN false;
  END IF;

  IF public.user_meets_password_policy(v_user_id, v_app_owner_org) IS FALSE THEN
    RETURN false;
  END IF;

  IF v_principal_type = public.rbac_principal_user()
    AND EXISTS (
      SELECT 1
      FROM public.org_users
      WHERE org_users.user_id = v_principal_id
        AND org_users.org_id = v_app_owner_org
        AND org_users.channel_id IS NULL
        AND (org_users.app_id IS NULL OR org_users.app_id = p_app_id)
        AND org_users.user_right >= p_min_right
      LIMIT 1
    )
  THEN
    RETURN true;
  END IF;

  v_permission := public.rbac_permission_for_legacy(p_min_right, public.rbac_scope_app());
  IF v_permission IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    WITH RECURSIVE direct_bindings AS (
      SELECT rb.role_id, rb.scope_type
      FROM public.role_bindings rb
      WHERE rb.principal_type = v_principal_type
        AND rb.principal_id = v_principal_id
        AND rb.scope_type = public.rbac_scope_org()
        AND rb.org_id = v_app_owner_org
        AND (rb.expires_at IS NULL OR rb.expires_at > now())

      UNION

      SELECT rb.role_id, rb.scope_type
      FROM public.role_bindings rb
      WHERE rb.principal_type = v_principal_type
        AND rb.principal_id = v_principal_id
        AND rb.scope_type = public.rbac_scope_app()
        AND rb.org_id = v_app_owner_org
        AND rb.app_id = v_app_uuid
        AND (rb.expires_at IS NULL OR rb.expires_at > now())

      UNION

      SELECT rb.role_id, rb.scope_type
      FROM public.group_members gm
      INNER JOIN public.groups g ON g.id = gm.group_id
      INNER JOIN public.role_bindings rb
        ON rb.principal_type = public.rbac_principal_group()
        AND rb.principal_id = gm.group_id
        AND rb.org_id = g.org_id
      WHERE v_principal_type = public.rbac_principal_user()
        AND gm.user_id = v_principal_id
        AND g.org_id = v_app_owner_org
        AND (
          (
            rb.scope_type = public.rbac_scope_org()
            AND rb.org_id = v_app_owner_org
          )
          OR (
            rb.scope_type = public.rbac_scope_app()
            AND rb.org_id = v_app_owner_org
            AND rb.app_id = v_app_uuid
          )
        )
        AND (rb.expires_at IS NULL OR rb.expires_at > now())
    ),
    role_closure AS (
      SELECT direct_bindings.role_id, direct_bindings.scope_type
      FROM direct_bindings

      UNION

      SELECT role_hierarchy.child_role_id, role_closure.scope_type
      FROM role_closure
      INNER JOIN public.role_hierarchy
        ON role_hierarchy.parent_role_id = role_closure.role_id
      INNER JOIN public.roles child_role
        ON child_role.id = role_hierarchy.child_role_id
        AND child_role.scope_type = role_closure.scope_type
    )
    SELECT 1
    FROM role_closure
    INNER JOIN public.role_permissions
      ON role_permissions.role_id = role_closure.role_id
    INNER JOIN public.permissions
      ON permissions.id = role_permissions.permission_id
    WHERE permissions.key = v_permission
    LIMIT 1
  );
END;
$$;

ALTER FUNCTION "public"."app_versions_has_app_permission"("public"."user_min_right", "uuid", character varying, "uuid", "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."app_versions_has_app_permission"("public"."user_min_right", "uuid", character varying, "uuid", "text") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."app_versions_has_app_permission"("public"."user_min_right", "uuid", character varying, "uuid", "text") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."app_versions_has_app_permission"("public"."user_min_right", "uuid", character varying, "uuid", "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."app_versions_has_app_permission"("public"."user_min_right", "uuid", character varying, "uuid", "text") TO "service_role";

COMMENT ON FUNCTION "public"."app_versions_has_app_permission"("public"."user_min_right", "uuid", character varying, "uuid", "text") IS
'Checks app_versions access for one target app. Used by app_versions RLS write/read paths so broad API keys with many app bindings do not materialize every linked app during bundle upload finalization.';

DROP POLICY IF EXISTS "Allow for auth, api keys (read+)" ON "public"."app_versions";
CREATE POLICY "Allow for auth, api keys (read+)"
ON "public"."app_versions"
FOR SELECT
TO "authenticated", "anon"
USING (
  (
    (SELECT auth.uid()) IS NOT NULL
    OR (SELECT public.get_apikey_header()) IS NOT NULL
  )
  AND EXISTS (
    SELECT 1
    FROM (SELECT auth.uid() AS uid, public.get_apikey_header() AS apikey) AS identity
    WHERE (
        identity.uid IS NOT NULL
        AND public.app_versions_has_app_permission(
          'read'::public.user_min_right,
          owner_org,
          app_id,
          identity.uid,
          NULL::text
        )
      )
      OR (
        identity.uid IS NULL
        AND identity.apikey IS NOT NULL
        AND public.app_versions_has_app_permission(
          'read'::public.user_min_right,
          owner_org,
          app_id,
          NULL::uuid,
          identity.apikey
        )
      )
  )
);

DROP POLICY IF EXISTS "Allow insert for api keys (write,all,upload) (upload+)" ON "public"."app_versions";
CREATE POLICY "Allow insert for api keys (write,all,upload) (upload+)"
ON "public"."app_versions"
FOR INSERT
TO "anon"
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM (SELECT public.get_apikey_header() AS apikey) AS identity
    WHERE identity.apikey IS NOT NULL
      AND public.app_versions_has_app_permission(
        'upload'::public.user_min_right,
        owner_org,
        app_id,
        NULL::uuid,
        identity.apikey
      )
  )
);

DROP POLICY IF EXISTS "Allow update for auth and api keys" ON "public"."app_versions";
CREATE POLICY "Allow update for auth and api keys"
ON "public"."app_versions"
FOR UPDATE
TO "authenticated", "anon"
USING (
  EXISTS (
    SELECT 1
    FROM (SELECT auth.uid() AS uid, public.get_apikey_header() AS apikey) AS identity
    WHERE (
        identity.uid IS NOT NULL
        AND public.app_versions_has_app_permission(
          'write'::public.user_min_right,
          owner_org,
          app_id,
          identity.uid,
          NULL::text
        )
      )
      OR (
        identity.uid IS NULL
        AND identity.apikey IS NOT NULL
        AND public.app_versions_has_app_permission(
          'upload'::public.user_min_right,
          owner_org,
          app_id,
          NULL::uuid,
          identity.apikey
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM (SELECT auth.uid() AS uid, public.get_apikey_header() AS apikey) AS identity
    WHERE (
        identity.uid IS NOT NULL
        AND public.app_versions_has_app_permission(
          'write'::public.user_min_right,
          owner_org,
          app_id,
          identity.uid,
          NULL::text
        )
      )
      OR (
        identity.uid IS NULL
        AND identity.apikey IS NOT NULL
        AND public.app_versions_has_app_permission(
          'upload'::public.user_min_right,
          owner_org,
          app_id,
          NULL::uuid,
          identity.apikey
        )
      )
  )
);
