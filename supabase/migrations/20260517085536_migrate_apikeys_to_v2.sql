-- Move every existing API key to RBAC-backed bindings and remove the old key scope columns.

CREATE TEMP TABLE _apikey_v2_current_orgs ON COMMIT DROP AS
SELECT DISTINCT source.user_id, source.org_id
FROM (
  SELECT ou.user_id, ou.org_id
  FROM public.org_users ou
  WHERE ou.user_right IS NULL OR ou.user_right::text NOT LIKE 'invite_%'

  UNION

  SELECT rb.principal_id AS user_id, rb.org_id
  FROM public.role_bindings rb
  WHERE rb.principal_type = public.rbac_principal_user()
    AND rb.org_id IS NOT NULL
    AND (rb.expires_at IS NULL OR rb.expires_at > now())

  UNION

  SELECT gm.user_id, g.org_id
  FROM public.group_members gm
  JOIN public.groups g ON g.id = gm.group_id
  JOIN public.role_bindings rb
    ON rb.principal_type = public.rbac_principal_group()
    AND rb.principal_id = gm.group_id
    AND rb.org_id = g.org_id
  WHERE rb.org_id IS NOT NULL
    AND (rb.expires_at IS NULL OR rb.expires_at > now())
) source
WHERE source.user_id IS NOT NULL
  AND source.org_id IS NOT NULL;

CREATE TEMP TABLE _apikey_v2_seed AS
SELECT ak.id, ak.user_id, ak.rbac_id, ak.mode
FROM public.apikeys ak;

INSERT INTO public.role_bindings (
  principal_type,
  principal_id,
  role_id,
  scope_type,
  org_id,
  granted_by,
  reason,
  is_direct
)
SELECT
  public.rbac_principal_apikey(),
  keys.rbac_id,
  roles.id,
  public.rbac_scope_org(),
  orgs.org_id,
  keys.user_id,
  'Migrated API key to RBAC bindings',
  true
FROM _apikey_v2_seed keys
JOIN _apikey_v2_current_orgs orgs ON orgs.user_id = keys.user_id
JOIN public.roles roles
  ON roles.name = CASE
    WHEN keys.mode = 'all'::public.key_mode THEN public.rbac_role_org_super_admin()
    ELSE public.rbac_role_org_member()
  END
ON CONFLICT DO NOTHING;

INSERT INTO public.role_bindings (
  principal_type,
  principal_id,
  role_id,
  scope_type,
  org_id,
  app_id,
  granted_by,
  reason,
  is_direct
)
SELECT
  public.rbac_principal_apikey(),
  keys.rbac_id,
  roles.id,
  public.rbac_scope_app(),
  apps.owner_org,
  apps.id,
  keys.user_id,
  'Migrated API key app binding',
  true
FROM _apikey_v2_seed keys
JOIN _apikey_v2_current_orgs orgs ON orgs.user_id = keys.user_id
JOIN public.apps apps ON apps.owner_org = orgs.org_id
JOIN public.roles roles
  ON roles.name = CASE keys.mode
    WHEN 'write'::public.key_mode THEN public.rbac_role_app_developer()
    WHEN 'upload'::public.key_mode THEN public.rbac_role_app_uploader()
    WHEN 'read'::public.key_mode THEN public.rbac_role_app_reader()
    ELSE NULL
  END
WHERE keys.mode IN ('read'::public.key_mode, 'upload'::public.key_mode, 'write'::public.key_mode)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  missing_count bigint;
BEGIN
  SELECT count(*)
  INTO missing_count
  FROM _apikey_v2_seed keys
  JOIN _apikey_v2_current_orgs orgs ON orgs.user_id = keys.user_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    WHERE rb.principal_type = public.rbac_principal_apikey()
      AND rb.principal_id = keys.rbac_id
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id = orgs.org_id
  );

  IF missing_count > 0 THEN
    RAISE EXCEPTION 'apikey_v2_migration_missing_org_bindings: %', missing_count;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."cleanup_apikey_role_bindings"() RETURNS "trigger"
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.role_bindings
  WHERE principal_type = public.rbac_principal_apikey()
    AND principal_id = OLD.rbac_id;

  RETURN OLD;
END;
$$;

ALTER FUNCTION "public"."cleanup_apikey_role_bindings"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."cleanup_apikey_role_bindings"() FROM PUBLIC;

DROP TRIGGER IF EXISTS "cleanup_apikey_role_bindings_on_delete" ON "public"."apikeys";
CREATE TRIGGER "cleanup_apikey_role_bindings_on_delete"
BEFORE DELETE ON "public"."apikeys"
FOR EACH ROW EXECUTE FUNCTION "public"."cleanup_apikey_role_bindings"();

CREATE OR REPLACE FUNCTION "public"."apikey_permission_for_keymode"(
  "keymode" "public"."key_mode"[],
  "scope_type" "text"
) RETURNS "text"
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF scope_type = public.rbac_scope_org() THEN
    RETURN CASE
      WHEN 'read'::public.key_mode = ANY(keymode) THEN public.rbac_perm_org_read()
      WHEN 'upload'::public.key_mode = ANY(keymode) THEN public.rbac_perm_org_update_settings()
      WHEN 'write'::public.key_mode = ANY(keymode) THEN public.rbac_perm_org_update_settings()
      ELSE public.rbac_perm_org_update_user_roles()
    END;
  END IF;

  RETURN CASE
    WHEN 'read'::public.key_mode = ANY(keymode) THEN public.rbac_perm_app_read()
    WHEN 'upload'::public.key_mode = ANY(keymode) THEN public.rbac_perm_app_upload_bundle()
    WHEN 'write'::public.key_mode = ANY(keymode) THEN public.rbac_perm_app_update_settings()
    ELSE public.rbac_perm_app_update_user_roles()
  END;
END;
$$;

ALTER FUNCTION "public"."apikey_permission_for_keymode"("public"."key_mode"[], "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."apikey_permission_for_keymode"("public"."key_mode"[], "text") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."apikey_permission_for_keymode"("public"."key_mode"[], "text") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."apikey_permission_for_keymode"("public"."key_mode"[], "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."apikey_permission_for_keymode"("public"."key_mode"[], "text") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."get_identity"("keymode" "public"."key_mode"[]) RETURNS "uuid"
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  auth_uid uuid;
  api_key_text text;
  api_key public.apikeys%ROWTYPE;
BEGIN
  PERFORM keymode;
  SELECT auth.uid() INTO auth_uid;
  IF auth_uid IS NOT NULL THEN
    RETURN auth_uid;
  END IF;

  SELECT public.get_apikey_header() INTO api_key_text;
  IF api_key_text IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO api_key FROM public.find_apikey_by_value(api_key_text) LIMIT 1;
  IF api_key.id IS NULL OR public.is_apikey_expired(api_key.expires_at) THEN
    RETURN NULL;
  END IF;

  RETURN api_key.user_id;
END;
$$;

ALTER FUNCTION "public"."get_identity"("keymode" "public"."key_mode"[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_identity_apikey_only"("keymode" "public"."key_mode"[]) RETURNS "uuid"
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  api_key_text text;
  api_key public.apikeys%ROWTYPE;
BEGIN
  PERFORM keymode;
  SELECT public.get_apikey_header() INTO api_key_text;
  IF api_key_text IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO api_key FROM public.find_apikey_by_value(api_key_text) LIMIT 1;
  IF api_key.id IS NULL OR public.is_apikey_expired(api_key.expires_at) THEN
    RETURN NULL;
  END IF;

  RETURN api_key.user_id;
END;
$$;

ALTER FUNCTION "public"."get_identity_apikey_only"("keymode" "public"."key_mode"[]) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_identity_apikey_only"("public"."key_mode"[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_identity_apikey_only"("public"."key_mode"[]) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."get_identity_for_apikey_creation"() RETURNS "uuid"
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  auth_uid uuid;
BEGIN
  SELECT auth.uid() INTO auth_uid;
  IF auth_uid IS NOT NULL THEN
    RETURN auth_uid;
  END IF;

  PERFORM public.pg_log('deny: APIKEY_CREATE_WITH_API_KEY_DISABLED', '{}'::jsonb);
  RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."get_identity_for_apikey_creation"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_identity_for_apikey_creation"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_identity_for_apikey_creation"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_identity_for_apikey_creation"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_identity_for_apikey_creation"() TO "service_role";

CREATE OR REPLACE FUNCTION "public"."get_identity_org_allowed"("keymode" "public"."key_mode"[], "org_id" "uuid") RETURNS "uuid"
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  auth_uid uuid;
  api_key_text text;
  api_key public.apikeys%ROWTYPE;
  required_permission text;
BEGIN
  SELECT auth.uid() INTO auth_uid;
  IF auth_uid IS NOT NULL THEN
    RETURN auth_uid;
  END IF;

  SELECT public.get_apikey_header() INTO api_key_text;
  IF api_key_text IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO api_key FROM public.find_apikey_by_value(api_key_text) LIMIT 1;
  IF api_key.id IS NULL OR public.is_apikey_expired(api_key.expires_at) THEN
    RETURN NULL;
  END IF;

  required_permission := public.apikey_permission_for_keymode(keymode, public.rbac_scope_org());
  IF public.rbac_has_permission(public.rbac_principal_apikey(), api_key.rbac_id, required_permission, org_id, NULL, NULL) THEN
    RETURN api_key.user_id;
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."get_identity_org_allowed"("keymode" "public"."key_mode"[], "org_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_identity_org_allowed_apikey_only"("keymode" "public"."key_mode"[], "org_id" "uuid") RETURNS "uuid"
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  api_key_text text;
  api_key public.apikeys%ROWTYPE;
  required_permission text;
BEGIN
  SELECT public.get_apikey_header() INTO api_key_text;
  IF api_key_text IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO api_key FROM public.find_apikey_by_value(api_key_text) LIMIT 1;
  IF api_key.id IS NULL OR public.is_apikey_expired(api_key.expires_at) THEN
    RETURN NULL;
  END IF;

  required_permission := public.apikey_permission_for_keymode(keymode, public.rbac_scope_org());
  IF public.rbac_has_permission(public.rbac_principal_apikey(), api_key.rbac_id, required_permission, org_id, NULL, NULL) THEN
    RETURN api_key.user_id;
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."get_identity_org_allowed_apikey_only"("keymode" "public"."key_mode"[], "org_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_identity_org_allowed_apikey_only"("public"."key_mode"[], "uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_identity_org_allowed_apikey_only"("public"."key_mode"[], "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."get_identity_org_appid"("keymode" "public"."key_mode"[], "org_id" "uuid", "app_id" character varying) RETURNS "uuid"
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  auth_uid uuid;
  api_key_text text;
  api_key public.apikeys%ROWTYPE;
  required_permission text;
BEGIN
  SELECT auth.uid() INTO auth_uid;
  IF auth_uid IS NOT NULL THEN
    RETURN auth_uid;
  END IF;

  SELECT public.get_apikey_header() INTO api_key_text;
  IF api_key_text IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO api_key FROM public.find_apikey_by_value(api_key_text) LIMIT 1;
  IF api_key.id IS NULL OR public.is_apikey_expired(api_key.expires_at) THEN
    RETURN NULL;
  END IF;

  required_permission := public.apikey_permission_for_keymode(keymode, public.rbac_scope_app());
  IF public.rbac_has_permission(public.rbac_principal_apikey(), api_key.rbac_id, required_permission, org_id, app_id, NULL) THEN
    RETURN api_key.user_id;
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."get_identity_org_appid"("keymode" "public"."key_mode"[], "org_id" "uuid", "app_id" character varying) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) RETURNS boolean
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  api_key public.apikeys%ROWTYPE;
BEGIN
  PERFORM keymode;
  SELECT * INTO api_key FROM public.find_apikey_by_value(apikey) LIMIT 1;
  RETURN api_key.id IS NOT NULL AND NOT public.is_apikey_expired(api_key.expires_at);
END;
$$;

ALTER FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) RETURNS boolean
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  api_key public.apikeys%ROWTYPE;
  app_org_id uuid;
  required_permission text;
BEGIN
  SELECT * INTO api_key FROM public.find_apikey_by_value(apikey) LIMIT 1;
  IF api_key.id IS NULL OR public.is_apikey_expired(api_key.expires_at) THEN
    RETURN false;
  END IF;

  SELECT owner_org INTO app_org_id
  FROM public.apps
  WHERE apps.app_id = is_allowed_capgkey.app_id
  LIMIT 1;

  IF app_org_id IS NULL THEN
    RETURN false;
  END IF;

  required_permission := public.apikey_permission_for_keymode(keymode, public.rbac_scope_app());
  RETURN public.rbac_has_permission(public.rbac_principal_apikey(), api_key.rbac_id, required_permission, app_org_id, app_id, NULL);
END;
$$;

ALTER FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "capgo_private"."matches_app_storage_apikey_owner"("folder_user_id" "text", "target_app_id" character varying, "keymode" "public"."key_mode"[]) RETURNS boolean
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  api_key_text text;
  api_key public.apikeys%ROWTYPE;
  target_app record;
  required_permission text;
BEGIN
  SELECT public.get_apikey_header() INTO api_key_text;
  IF api_key_text IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO api_key FROM public.find_apikey_by_value(api_key_text) LIMIT 1;
  IF api_key.id IS NULL OR public.is_apikey_expired(api_key.expires_at) THEN
    RETURN false;
  END IF;

  SELECT user_id, owner_org
  INTO target_app
  FROM public.apps
  WHERE app_id = target_app_id
  LIMIT 1;

  IF target_app.user_id IS NULL THEN
    RETURN false;
  END IF;

  IF api_key.user_id::text <> folder_user_id OR target_app.user_id <> api_key.user_id THEN
    RETURN false;
  END IF;

  required_permission := public.apikey_permission_for_keymode(keymode, public.rbac_scope_app());
  RETURN public.rbac_has_permission(public.rbac_principal_apikey(), api_key.rbac_id, required_permission, target_app.owner_org, target_app_id, NULL);
END;
$$;

ALTER FUNCTION "capgo_private"."matches_app_storage_apikey_owner"("folder_user_id" "text", "target_app_id" character varying, "keymode" "public"."key_mode"[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."has_app_right_apikey"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid", "apikey" "text") RETURNS boolean
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  api_key public.apikeys%ROWTYPE;
  org_id uuid;
  permission_key text;
BEGIN
  SELECT * INTO api_key FROM public.find_apikey_by_value(apikey) LIMIT 1;
  IF api_key.id IS NULL OR api_key.user_id IS DISTINCT FROM userid THEN
    RETURN false;
  END IF;

  IF public.is_apikey_expired(api_key.expires_at) THEN
    RETURN false;
  END IF;

  SELECT owner_org INTO org_id
  FROM public.apps
  WHERE app_id = appid
  LIMIT 1;

  IF org_id IS NULL THEN
    RETURN false;
  END IF;

  permission_key := CASE
    WHEN "right" = 'read'::public.user_min_right THEN public.rbac_perm_app_read()
    WHEN "right" = 'upload'::public.user_min_right THEN public.rbac_perm_app_upload_bundle()
    WHEN "right" = 'write'::public.user_min_right THEN public.rbac_perm_app_update_settings()
    ELSE public.rbac_perm_app_update_user_roles()
  END;

  RETURN public.rbac_has_permission(public.rbac_principal_apikey(), api_key.rbac_id, permission_key, org_id, appid, NULL);
END;
$$;

ALTER FUNCTION "public"."has_app_right_apikey"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid", "apikey" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."rbac_check_permission_direct"(
  "p_permission_key" "text",
  "p_user_id" "uuid",
  "p_org_id" "uuid",
  "p_app_id" character varying,
  "p_channel_id" bigint,
  "p_apikey" "text" DEFAULT NULL::"text"
) RETURNS boolean
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_allowed boolean := false;
  v_use_rbac boolean;
  v_effective_org_id uuid := p_org_id;
  v_effective_user_id uuid := p_user_id;
  v_effective_app_id character varying := p_app_id;
  v_legacy_right public.user_min_right;
  v_api_key public.apikeys%ROWTYPE;
  v_channel_org_id uuid;
  v_channel_app_id character varying;
  v_channel_scope boolean := p_channel_id IS NOT NULL;
  v_override boolean;
BEGIN
  IF p_permission_key IS NULL OR p_permission_key = '' THEN
    RETURN false;
  END IF;

  IF v_effective_org_id IS NULL AND p_app_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id
    FROM public.apps
    WHERE app_id = p_app_id
    LIMIT 1;
  END IF;

  IF p_channel_id IS NOT NULL THEN
    SELECT owner_org, app_id
    INTO v_channel_org_id, v_channel_app_id
    FROM public.channels
    WHERE id = p_channel_id
    LIMIT 1;

    IF v_channel_org_id IS NOT NULL THEN
      v_effective_org_id := v_channel_org_id;
      v_effective_app_id := v_channel_app_id;
    END IF;
  END IF;

  IF p_apikey IS NOT NULL THEN
    SELECT * INTO v_api_key
    FROM public.find_apikey_by_value(p_apikey)
    LIMIT 1;

    IF v_api_key.id IS NULL
      OR public.is_apikey_expired(v_api_key.expires_at)
      OR (p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM v_api_key.user_id)
      OR v_effective_org_id IS NULL
    THEN
      RETURN false;
    END IF;

    v_effective_user_id := v_api_key.user_id;
    v_allowed := public.rbac_has_permission(
      public.rbac_principal_apikey(),
      v_api_key.rbac_id,
      p_permission_key,
      v_effective_org_id,
      v_effective_app_id,
      p_channel_id
    );

    IF v_channel_scope THEN
      SELECT o.is_allowed INTO v_override
      FROM public.channel_permission_overrides o
      WHERE o.principal_type = public.rbac_principal_apikey()
        AND o.principal_id = v_api_key.rbac_id
        AND o.channel_id = p_channel_id
        AND o.permission_key = p_permission_key
      LIMIT 1;

      IF v_override IS NOT NULL THEN
        v_allowed := v_override;
      END IF;
    END IF;

    RETURN v_allowed;
  END IF;

  IF v_effective_org_id IS NOT NULL THEN
    IF (SELECT enforcing_2fa FROM public.orgs WHERE id = v_effective_org_id)
      AND (v_effective_user_id IS NULL OR NOT public.has_2fa_enabled(v_effective_user_id))
    THEN
      RETURN false;
    END IF;

    IF public.user_meets_password_policy(v_effective_user_id, v_effective_org_id) = false THEN
      RETURN false;
    END IF;
  END IF;

  v_use_rbac := public.rbac_is_enabled_for_org(v_effective_org_id);
  IF v_use_rbac THEN
    IF v_effective_user_id IS NOT NULL THEN
      v_allowed := public.rbac_has_permission(
        public.rbac_principal_user(),
        v_effective_user_id,
        p_permission_key,
        v_effective_org_id,
        v_effective_app_id,
        p_channel_id
      );
    END IF;

    IF v_channel_scope THEN
      SELECT o.is_allowed INTO v_override
      FROM public.channel_permission_overrides o
      WHERE o.principal_type = public.rbac_principal_user()
        AND o.principal_id = v_effective_user_id
        AND o.channel_id = p_channel_id
        AND o.permission_key = p_permission_key
      LIMIT 1;

      IF v_override IS NOT NULL THEN
        v_allowed := v_override;
      END IF;
    END IF;

    RETURN v_allowed;
  END IF;

  v_legacy_right := public.rbac_legacy_right_for_permission(p_permission_key);
  IF v_legacy_right IS NULL THEN
    RETURN false;
  END IF;

  IF v_effective_app_id IS NOT NULL THEN
    RETURN public.has_app_right_userid(v_effective_app_id, v_legacy_right, v_effective_user_id);
  END IF;

  RETURN public.check_min_rights_legacy(v_legacy_right, v_effective_user_id, v_effective_org_id, v_effective_app_id, p_channel_id);
END;
$$;

ALTER FUNCTION "public"."rbac_check_permission_direct"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."rbac_check_permission_direct_no_password_policy"(
  "p_permission_key" "text",
  "p_user_id" "uuid",
  "p_org_id" "uuid",
  "p_app_id" character varying,
  "p_channel_id" bigint,
  "p_apikey" "text" DEFAULT NULL::"text"
) RETURNS boolean
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_allowed boolean := false;
  v_use_rbac boolean;
  v_effective_org_id uuid := p_org_id;
  v_effective_user_id uuid := p_user_id;
  v_effective_app_id character varying := p_app_id;
  v_legacy_right public.user_min_right;
  v_api_key public.apikeys%ROWTYPE;
  v_channel_org_id uuid;
  v_channel_app_id character varying;
BEGIN
  IF p_permission_key IS NULL OR p_permission_key = '' THEN
    RETURN false;
  END IF;

  IF v_effective_org_id IS NULL AND p_app_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id
    FROM public.apps
    WHERE app_id = p_app_id
    LIMIT 1;
  END IF;

  IF p_channel_id IS NOT NULL THEN
    SELECT owner_org, app_id
    INTO v_channel_org_id, v_channel_app_id
    FROM public.channels
    WHERE id = p_channel_id
    LIMIT 1;

    IF v_channel_org_id IS NOT NULL THEN
      v_effective_org_id := v_channel_org_id;
      v_effective_app_id := v_channel_app_id;
    END IF;
  END IF;

  IF p_apikey IS NOT NULL THEN
    SELECT * INTO v_api_key
    FROM public.find_apikey_by_value(p_apikey)
    LIMIT 1;

    IF v_api_key.id IS NULL
      OR public.is_apikey_expired(v_api_key.expires_at)
      OR (p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM v_api_key.user_id)
      OR v_effective_org_id IS NULL
    THEN
      RETURN false;
    END IF;

    RETURN public.rbac_has_permission(
      public.rbac_principal_apikey(),
      v_api_key.rbac_id,
      p_permission_key,
      v_effective_org_id,
      v_effective_app_id,
      p_channel_id
    );
  END IF;

  IF v_effective_org_id IS NOT NULL THEN
    IF (SELECT enforcing_2fa FROM public.orgs WHERE id = v_effective_org_id)
      AND (v_effective_user_id IS NULL OR NOT public.has_2fa_enabled(v_effective_user_id))
    THEN
      RETURN false;
    END IF;
  END IF;

  v_use_rbac := public.rbac_is_enabled_for_org(v_effective_org_id);
  IF v_use_rbac THEN
    IF v_effective_user_id IS NULL THEN
      RETURN false;
    END IF;

    RETURN public.rbac_has_permission(
      public.rbac_principal_user(),
      v_effective_user_id,
      p_permission_key,
      v_effective_org_id,
      v_effective_app_id,
      p_channel_id
    );
  END IF;

  v_legacy_right := public.rbac_legacy_right_for_permission(p_permission_key);
  IF v_legacy_right IS NULL THEN
    RETURN false;
  END IF;

  IF v_effective_app_id IS NOT NULL THEN
    RETURN public.has_app_right_userid(v_effective_app_id, v_legacy_right, v_effective_user_id);
  END IF;

  RETURN public.check_min_rights_legacy_no_password_policy(v_legacy_right, v_effective_user_id, v_effective_org_id, v_effective_app_id, p_channel_id);
END;
$$;

ALTER FUNCTION "public"."rbac_check_permission_direct_no_password_policy"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."app_versions_readable_app_ids"() RETURNS character varying[]
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
  v_allowed character varying[] := '{}'::character varying[];
BEGIN
  SELECT auth.uid() INTO v_user_id;
  SELECT public.get_apikey_header() INTO v_api_key_text;

  IF v_user_id IS NULL AND v_api_key_text IS NULL THEN
    RETURN v_allowed;
  END IF;

  IF v_api_key_text IS NOT NULL THEN
    SELECT * INTO v_api_key FROM public.find_apikey_by_value(v_api_key_text) LIMIT 1;
    IF v_api_key.id IS NULL OR public.is_apikey_expired(v_api_key.expires_at) THEN
      RETURN v_allowed;
    END IF;
    v_user_id := v_api_key.user_id;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT apps.app_id), '{}'::character varying[])
  INTO v_allowed
  FROM public.apps
  WHERE CASE
    WHEN v_api_key.id IS NOT NULL THEN public.rbac_check_permission_direct(public.rbac_perm_app_read(), v_user_id, apps.owner_org, apps.app_id, NULL, v_api_key_text)
    ELSE public.check_min_rights('read'::public.user_min_right, v_user_id, apps.owner_org, apps.app_id, NULL::bigint)
  END;

  RETURN v_allowed;
END;
$$;

ALTER FUNCTION "public"."app_versions_readable_app_ids"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."audit_logs_allowed_orgs"() RETURNS "uuid"[]
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
  v_permission text := public.rbac_permission_for_legacy(public.rbac_right_super_admin(), public.rbac_scope_org());
  v_allowed uuid[] := '{}'::uuid[];
BEGIN
  SELECT auth.uid() INTO v_user_id;
  SELECT public.get_apikey_header() INTO v_api_key_text;

  IF v_user_id IS NULL AND v_api_key_text IS NULL THEN
    RETURN v_allowed;
  END IF;

  IF v_api_key_text IS NOT NULL THEN
    SELECT * INTO v_api_key FROM public.find_apikey_by_value(v_api_key_text) LIMIT 1;
    IF v_api_key.id IS NULL OR public.is_apikey_expired(v_api_key.expires_at) THEN
      RETURN v_allowed;
    END IF;
    v_user_id := v_api_key.user_id;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT orgs.id), '{}'::uuid[])
  INTO v_allowed
  FROM public.orgs
  WHERE CASE
    WHEN v_api_key.id IS NOT NULL THEN public.rbac_check_permission_direct(v_permission, v_user_id, orgs.id, NULL, NULL, v_api_key_text)
    ELSE public.rbac_check_permission_direct(v_permission, v_user_id, orgs.id, NULL, NULL, NULL)
  END;

  RETURN v_allowed;
END;
$$;

ALTER FUNCTION "public"."audit_logs_allowed_orgs"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."usage_credit_readable_org_ids"() RETURNS "uuid"[]
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
  v_permission text := public.rbac_permission_for_legacy(public.rbac_right_admin(), public.rbac_scope_org());
  v_allowed uuid[] := '{}'::uuid[];
BEGIN
  SELECT auth.uid() INTO v_user_id;
  SELECT public.get_apikey_header() INTO v_api_key_text;

  IF v_user_id IS NULL AND v_api_key_text IS NULL THEN
    RETURN v_allowed;
  END IF;

  IF v_api_key_text IS NOT NULL THEN
    SELECT * INTO v_api_key FROM public.find_apikey_by_value(v_api_key_text) LIMIT 1;
    IF v_api_key.id IS NULL OR public.is_apikey_expired(v_api_key.expires_at) THEN
      RETURN v_allowed;
    END IF;
    v_user_id := v_api_key.user_id;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT orgs.id), '{}'::uuid[])
  INTO v_allowed
  FROM public.orgs
  WHERE CASE
    WHEN v_api_key.id IS NOT NULL THEN public.rbac_check_permission_direct(v_permission, v_user_id, orgs.id, NULL, NULL, v_api_key_text)
    ELSE public.check_min_rights('admin'::public.user_min_right, v_user_id, orgs.id, NULL::character varying, NULL::bigint)
  END;

  RETURN v_allowed;
END;
$$;

ALTER FUNCTION "public"."usage_credit_readable_org_ids"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_user_org_ids"() RETURNS TABLE("org_id" "uuid")
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  api_key_text text;
  api_key public.apikeys%ROWTYPE;
  v_user_id uuid;
BEGIN
  SELECT public.get_apikey_header() INTO api_key_text;

  IF api_key_text IS NOT NULL THEN
    SELECT * INTO api_key FROM public.find_apikey_by_value(api_key_text) LIMIT 1;
    IF api_key.id IS NULL OR public.is_apikey_expired(api_key.expires_at) THEN
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;

    RETURN QUERY
    SELECT DISTINCT scoped.org_uuid
    FROM (
      SELECT rb.org_id AS org_uuid
      FROM public.role_bindings rb
      WHERE rb.principal_type = public.rbac_principal_apikey()
        AND rb.principal_id = api_key.rbac_id
        AND rb.org_id IS NOT NULL
        AND (rb.expires_at IS NULL OR rb.expires_at > now())

      UNION

      SELECT apps.owner_org AS org_uuid
      FROM public.role_bindings rb
      JOIN public.apps ON apps.id = rb.app_id
      WHERE rb.principal_type = public.rbac_principal_apikey()
        AND rb.principal_id = api_key.rbac_id
        AND rb.app_id IS NOT NULL
        AND (rb.expires_at IS NULL OR rb.expires_at > now())

      UNION

      SELECT apps.owner_org AS org_uuid
      FROM public.role_bindings rb
      JOIN public.channels ch ON ch.rbac_id = rb.channel_id
      JOIN public.apps ON apps.app_id = ch.app_id
      WHERE rb.principal_type = public.rbac_principal_apikey()
        AND rb.principal_id = api_key.rbac_id
        AND rb.channel_id IS NOT NULL
        AND (rb.expires_at IS NULL OR rb.expires_at > now())
    ) scoped
    WHERE scoped.org_uuid IS NOT NULL;
    RETURN;
  END IF;

  SELECT public.get_identity() INTO v_user_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No authentication provided - API key or valid session required';
  END IF;

  RETURN QUERY
  SELECT DISTINCT scoped.org_uuid
  FROM (
    SELECT org_users.org_id AS org_uuid
    FROM public.org_users
    WHERE org_users.user_id = v_user_id

    UNION

    SELECT rb.org_id AS org_uuid
    FROM public.role_bindings rb
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = v_user_id
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())

    UNION

    SELECT apps.owner_org AS org_uuid
    FROM public.role_bindings rb
    JOIN public.apps ON apps.id = rb.app_id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = v_user_id
      AND rb.app_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())

    UNION

    SELECT rb.org_id AS org_uuid
    FROM public.role_bindings rb
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = v_user_id
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ) scoped
  WHERE scoped.org_uuid IS NOT NULL;
END;
$$;

ALTER FUNCTION "public"."get_user_org_ids"() OWNER TO "postgres";
COMMENT ON FUNCTION "public"."get_user_org_ids"() IS 'Org id list for authenticated users or RBAC-scoped API keys.';

CREATE OR REPLACE FUNCTION "public"."get_orgs_v6"() RETURNS TABLE("gid" "uuid", "created_by" "uuid", "logo" "text", "name" "text", "role" character varying, "paying" boolean, "trial_left" integer, "can_use_more" boolean, "is_canceled" boolean, "app_count" bigint, "subscription_start" timestamp with time zone, "subscription_end" timestamp with time zone, "management_email" "text", "is_yearly" boolean, "stats_updated_at" timestamp without time zone, "next_stats_update_at" timestamp with time zone, "credit_available" numeric, "credit_total" numeric, "credit_next_expiration" timestamp with time zone, "require_apikey_expiration" boolean, "max_apikey_expiration_days" integer)
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
BEGIN
  SELECT public.get_apikey_header() INTO v_api_key_text;
  IF v_api_key_text IS NOT NULL THEN
    SELECT * INTO v_api_key FROM public.find_apikey_by_value(v_api_key_text) LIMIT 1;
    IF v_api_key.id IS NULL OR public.is_apikey_expired(v_api_key.expires_at) THEN
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;
    v_user_id := v_api_key.user_id;
  ELSE
    SELECT public.get_identity() INTO v_user_id;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No authentication provided - API key or valid session required';
  END IF;

  RETURN QUERY
  SELECT orgs.*
  FROM public.get_orgs_v6(v_user_id) orgs
  JOIN public.get_user_org_ids() allowed_orgs ON allowed_orgs.org_id = orgs.gid;
END;
$$;

ALTER FUNCTION "public"."get_orgs_v6"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_orgs_v7"() RETURNS TABLE("gid" "uuid", "created_by" "uuid", "created_at" timestamp with time zone, "logo" "text", "website" "text", "name" "text", "role" character varying, "paying" boolean, "trial_left" integer, "can_use_more" boolean, "is_canceled" boolean, "app_count" bigint, "subscription_start" timestamp with time zone, "subscription_end" timestamp with time zone, "management_email" "text", "is_yearly" boolean, "stats_updated_at" timestamp without time zone, "stats_refresh_requested_at" timestamp without time zone, "next_stats_update_at" timestamp with time zone, "credit_available" numeric, "credit_total" numeric, "credit_next_expiration" timestamp with time zone, "enforcing_2fa" boolean, "2fa_has_access" boolean, "enforce_hashed_api_keys" boolean, "password_policy_config" "jsonb", "password_has_access" boolean, "require_apikey_expiration" boolean, "max_apikey_expiration_days" integer, "enforce_encrypted_bundles" boolean, "required_encryption_key" character varying, "use_new_rbac" boolean)
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
BEGIN
  SELECT public.get_apikey_header() INTO v_api_key_text;
  IF v_api_key_text IS NOT NULL THEN
    SELECT * INTO v_api_key FROM public.find_apikey_by_value(v_api_key_text) LIMIT 1;
    IF v_api_key.id IS NULL OR public.is_apikey_expired(v_api_key.expires_at) THEN
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;
    v_user_id := v_api_key.user_id;
  ELSE
    SELECT public.get_identity() INTO v_user_id;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No authentication provided - API key or valid session required';
  END IF;

  RETURN QUERY
  SELECT orgs.*
  FROM public.get_orgs_v7(v_user_id) orgs
  JOIN public.get_user_org_ids() allowed_orgs ON allowed_orgs.org_id = orgs.gid;
END;
$$;

ALTER FUNCTION "public"."get_orgs_v7"() OWNER TO "postgres";

DROP FUNCTION IF EXISTS "public"."get_org_apikeys"("p_org_id" "uuid");
CREATE OR REPLACE FUNCTION "public"."get_org_apikeys"("p_org_id" "uuid") RETURNS TABLE(
  "id" bigint,
  "rbac_id" "uuid",
  "name" "text",
  "user_id" "uuid",
  "owner_email" character varying,
  "created_at" timestamp with time zone,
  "expires_at" timestamp with time zone
)
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.rbac_check_permission_direct(
    public.rbac_perm_org_update_user_roles(),
    auth.uid(),
    p_org_id,
    NULL,
    NULL,
    NULL
  ) THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    ak.id,
    ak.rbac_id,
    ak.name::text,
    ak.user_id,
    users.email,
    ak.created_at,
    ak.expires_at
  FROM public.apikeys ak
  JOIN public.users users ON users.id = ak.user_id
  JOIN public.role_bindings rb
    ON rb.principal_type = public.rbac_principal_apikey()
    AND rb.principal_id = ak.rbac_id
    AND rb.org_id = p_org_id
    AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ORDER BY ak.created_at DESC;
END;
$$;

ALTER FUNCTION "public"."get_org_apikeys"("p_org_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_org_apikeys"("p_org_id" "uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_org_apikeys"("p_org_id" "uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_org_apikeys"("p_org_id" "uuid") TO "authenticated";

CREATE OR REPLACE FUNCTION "public"."enforce_apikey_expiration_policy"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  scoped_org record;
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  FOR scoped_org IN
    SELECT DISTINCT
      public.orgs.id,
      public.orgs.require_apikey_expiration,
      public.orgs.max_apikey_expiration_days
    FROM public.role_bindings
    JOIN public.orgs ON public.orgs.id = public.role_bindings.org_id
    WHERE public.role_bindings.principal_type = public.rbac_principal_apikey()
      AND public.role_bindings.principal_id = NEW.rbac_id
      AND public.role_bindings.org_id IS NOT NULL
  LOOP
    IF scoped_org.require_apikey_expiration AND NEW.expires_at IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'expiration_required',
        DETAIL = 'This organization requires API keys to have an expiration date';
    END IF;

    IF scoped_org.max_apikey_expiration_days IS NOT NULL
      AND NEW.expires_at IS NOT NULL
      AND NEW.expires_at > clock_timestamp() + make_interval(days => scoped_org.max_apikey_expiration_days)
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'expiration_exceeds_max',
        DETAIL = format('API key expiration cannot exceed %s days for this organization', scoped_org.max_apikey_expiration_days);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."enforce_apikey_expiration_policy"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."enforce_apikey_expiration_policy"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."enforce_apikey_expiration_policy"() TO "service_role";

CREATE OR REPLACE FUNCTION "public"."check_apikey_hashed_key_enforcement"("apikey_row" "public"."apikeys")
RETURNS boolean
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  scoped_enforced_org_exists boolean;
BEGIN
  IF apikey_row.key IS NULL AND apikey_row.key_hash IS NOT NULL THEN
    RETURN true;
  END IF;

  WITH scoped_orgs AS (
    SELECT public.role_bindings.org_id
    FROM public.role_bindings
    WHERE apikey_row.rbac_id IS NOT NULL
      AND public.role_bindings.principal_type = public.rbac_principal_apikey()
      AND public.role_bindings.principal_id = apikey_row.rbac_id
      AND public.role_bindings.scope_type = public.rbac_scope_org()
      AND public.role_bindings.org_id IS NOT NULL
      AND (public.role_bindings.expires_at IS NULL OR public.role_bindings.expires_at > now())

    UNION

    SELECT public.apps.owner_org
    FROM public.role_bindings
    JOIN public.apps ON public.apps.id = public.role_bindings.app_id
    WHERE apikey_row.rbac_id IS NOT NULL
      AND public.role_bindings.principal_type = public.rbac_principal_apikey()
      AND public.role_bindings.principal_id = apikey_row.rbac_id
      AND public.role_bindings.scope_type = public.rbac_scope_app()
      AND public.role_bindings.app_id IS NOT NULL
      AND (public.role_bindings.expires_at IS NULL OR public.role_bindings.expires_at > now())

    UNION

    SELECT public.apps.owner_org
    FROM public.role_bindings
    JOIN public.channels ON public.channels.rbac_id = public.role_bindings.channel_id
    JOIN public.apps ON public.apps.app_id = public.channels.app_id
    WHERE apikey_row.rbac_id IS NOT NULL
      AND public.role_bindings.principal_type = public.rbac_principal_apikey()
      AND public.role_bindings.principal_id = apikey_row.rbac_id
      AND public.role_bindings.scope_type = public.rbac_scope_channel()
      AND public.role_bindings.channel_id IS NOT NULL
      AND (public.role_bindings.expires_at IS NULL OR public.role_bindings.expires_at > now())
  )
  SELECT EXISTS (
    SELECT 1
    FROM scoped_orgs
    JOIN public.orgs ON public.orgs.id = scoped_orgs.org_id
    WHERE public.orgs.enforce_hashed_api_keys = true
  )
  INTO scoped_enforced_org_exists;

  IF scoped_enforced_org_exists THEN
    PERFORM public.pg_log(
      'deny: ORG_REQUIRES_HASHED_API_KEY',
      jsonb_build_object('apikey_id', apikey_row.id, 'user_id', apikey_row.user_id)
    );
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

ALTER FUNCTION "public"."check_apikey_hashed_key_enforcement"("public"."apikeys") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."check_apikey_hashed_key_enforcement"("public"."apikeys") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."check_apikey_hashed_key_enforcement"("public"."apikeys") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."find_apikey_by_value"("key_value" "text") RETURNS SETOF "public"."apikeys"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = ''
    AS $$
DECLARE
  apikey_row public.apikeys%ROWTYPE;
BEGIN
  SELECT public.apikeys.*
  INTO apikey_row
  FROM public.apikeys
  WHERE public.apikeys.key = key_value
    OR public.apikeys.key_hash = encode(extensions.digest(key_value, 'sha256'), 'hex')
  LIMIT 1;

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
GRANT EXECUTE ON FUNCTION "public"."find_apikey_by_value"("key_value" "text") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."find_apikey_by_value"("key_value" "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."find_apikey_by_value"("key_value" "text") TO "service_role";

DROP POLICY IF EXISTS "Allow admin to select webhooks" ON "public"."webhooks";
DROP POLICY IF EXISTS "Allow admin to insert webhooks" ON "public"."webhooks";
DROP POLICY IF EXISTS "Allow admin to update webhooks" ON "public"."webhooks";
DROP POLICY IF EXISTS "Allow admin to delete webhooks" ON "public"."webhooks";

CREATE POLICY "Allow admin to select webhooks"
ON "public"."webhooks"
FOR SELECT
TO "authenticated", "anon"
USING (
  public.check_min_rights(
    'admin'::public.user_min_right,
    CASE
      WHEN (SELECT public.get_apikey_header()) IS NOT NULL THEN NULL::uuid
      ELSE (SELECT auth.uid())
    END,
    org_id,
    NULL::character varying,
    NULL::bigint
  )
);

CREATE POLICY "Allow admin to insert webhooks"
ON "public"."webhooks"
FOR INSERT
TO "authenticated", "anon"
WITH CHECK (
  public.check_min_rights(
    'admin'::public.user_min_right,
    CASE
      WHEN (SELECT public.get_apikey_header()) IS NOT NULL THEN NULL::uuid
      ELSE (SELECT auth.uid())
    END,
    org_id,
    NULL::character varying,
    NULL::bigint
  )
);

CREATE POLICY "Allow admin to update webhooks"
ON "public"."webhooks"
FOR UPDATE
TO "authenticated", "anon"
USING (
  public.check_min_rights(
    'admin'::public.user_min_right,
    CASE
      WHEN (SELECT public.get_apikey_header()) IS NOT NULL THEN NULL::uuid
      ELSE (SELECT auth.uid())
    END,
    org_id,
    NULL::character varying,
    NULL::bigint
  )
)
WITH CHECK (
  public.check_min_rights(
    'admin'::public.user_min_right,
    CASE
      WHEN (SELECT public.get_apikey_header()) IS NOT NULL THEN NULL::uuid
      ELSE (SELECT auth.uid())
    END,
    org_id,
    NULL::character varying,
    NULL::bigint
  )
);

CREATE POLICY "Allow admin to delete webhooks"
ON "public"."webhooks"
FOR DELETE
TO "authenticated", "anon"
USING (
  public.check_min_rights(
    'admin'::public.user_min_right,
    CASE
      WHEN (SELECT public.get_apikey_header()) IS NOT NULL THEN NULL::uuid
      ELSE (SELECT auth.uid())
    END,
    org_id,
    NULL::character varying,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow org members to select webhook_deliveries" ON "public"."webhook_deliveries";
DROP POLICY IF EXISTS "Allow admin to insert webhook_deliveries" ON "public"."webhook_deliveries";
DROP POLICY IF EXISTS "Allow admin to update webhook_deliveries" ON "public"."webhook_deliveries";

CREATE POLICY "Allow org members to select webhook_deliveries"
ON "public"."webhook_deliveries"
FOR SELECT
TO "authenticated", "anon"
USING (
  public.check_min_rights(
    'read'::public.user_min_right,
    CASE
      WHEN (SELECT public.get_apikey_header()) IS NOT NULL THEN NULL::uuid
      ELSE (SELECT auth.uid())
    END,
    org_id,
    NULL::character varying,
    NULL::bigint
  )
);

CREATE POLICY "Allow admin to insert webhook_deliveries"
ON "public"."webhook_deliveries"
FOR INSERT
TO "authenticated", "anon"
WITH CHECK (
  public.check_min_rights(
    'admin'::public.user_min_right,
    CASE
      WHEN (SELECT public.get_apikey_header()) IS NOT NULL THEN NULL::uuid
      ELSE (SELECT auth.uid())
    END,
    org_id,
    NULL::character varying,
    NULL::bigint
  )
);

CREATE POLICY "Allow admin to update webhook_deliveries"
ON "public"."webhook_deliveries"
FOR UPDATE
TO "authenticated", "anon"
USING (
  public.check_min_rights(
    'admin'::public.user_min_right,
    CASE
      WHEN (SELECT public.get_apikey_header()) IS NOT NULL THEN NULL::uuid
      ELSE (SELECT auth.uid())
    END,
    org_id,
    NULL::character varying,
    NULL::bigint
  )
)
WITH CHECK (
  public.check_min_rights(
    'admin'::public.user_min_right,
    CASE
      WHEN (SELECT public.get_apikey_header()) IS NOT NULL THEN NULL::uuid
      ELSE (SELECT auth.uid())
    END,
    org_id,
    NULL::character varying,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow owner to insert own apikeys" ON "public"."apikeys";
DROP POLICY IF EXISTS "Deny client insert on apikeys" ON "public"."apikeys";
CREATE POLICY "Deny client insert on apikeys" ON "public"."apikeys"
AS RESTRICTIVE
FOR INSERT
TO "anon", "authenticated"
WITH CHECK (false);

DROP POLICY IF EXISTS "Allow owner to update own apikeys" ON "public"."apikeys";
DROP POLICY IF EXISTS "Allow owner to update own V2 apikeys" ON "public"."apikeys";
CREATE POLICY "Allow owner to update own apikeys" ON "public"."apikeys"
FOR UPDATE
TO "anon", "authenticated"
USING (
  "user_id" = (SELECT public.get_identity_for_apikey_creation())
)
WITH CHECK (
  "user_id" = (SELECT public.get_identity_for_apikey_creation())
);

DROP FUNCTION IF EXISTS "public"."create_hashed_apikey"("public"."key_mode", "text", "uuid"[], "text"[], timestamp with time zone);
DROP FUNCTION IF EXISTS "public"."create_hashed_apikey_for_user"("uuid", "public"."key_mode", "text", "uuid"[], "text"[], timestamp with time zone);

ALTER TABLE "public"."apikeys"
  DROP COLUMN IF EXISTS "mode",
  DROP COLUMN IF EXISTS "limited_to_orgs",
  DROP COLUMN IF EXISTS "limited_to_apps";

CREATE OR REPLACE FUNCTION "public"."get_accessible_apps_for_apikey_v2"(
  "apikey" "text" DEFAULT NULL
) RETURNS SETOF "public"."apps"
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_apikey text;
  v_api_key public.apikeys%ROWTYPE;
BEGIN
  SELECT public.get_apikey_header() INTO v_request_apikey;

  IF v_request_apikey IS NULL OR v_request_apikey = '' THEN
    RETURN;
  END IF;

  IF apikey IS NOT NULL AND apikey <> '' AND apikey IS DISTINCT FROM v_request_apikey THEN
    RETURN;
  END IF;

  SELECT * INTO v_api_key
  FROM public.find_apikey_by_value(v_request_apikey)
  LIMIT 1;

  IF v_api_key.id IS NULL OR public.is_apikey_expired(v_api_key.expires_at) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT apps.*
  FROM public.apps
  WHERE public.rbac_check_permission_direct(
    public.rbac_perm_app_read(),
    v_api_key.user_id,
    apps.owner_org,
    apps.app_id,
    NULL,
    v_request_apikey
  )
  ORDER BY apps.created_at DESC;
END;
$$;

ALTER FUNCTION "public"."get_accessible_apps_for_apikey_v2"("apikey" "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"("apikey" "text") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"("apikey" "text") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"("apikey" "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"("apikey" "text") TO "service_role";
COMMENT ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"("apikey" "text") IS 'Returns apps visible to the request capgkey using RBAC permission checks. The apikey argument is retained for CLI compatibility and must match the header when provided.';
