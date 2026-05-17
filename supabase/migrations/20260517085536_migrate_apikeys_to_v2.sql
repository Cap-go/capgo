-- Move every existing API key to RBAC-backed bindings and remove the old key scope columns.

DO $$
DECLARE
  v_org_id uuid;
BEGIN
  FOR v_org_id IN
    SELECT id FROM public.orgs
  LOOP
    PERFORM public.rbac_migrate_org_users_to_bindings(v_org_id, NULL::uuid);
  END LOOP;
END;
$$;

-- Existing-user invites used to create role_bindings before the user accepted
-- the invitation. Pending invites must not grant active RBAC access.
DELETE FROM public.role_bindings
WHERE principal_type = public.rbac_principal_user()
  AND reason = 'Invited via invite_user_to_org_rbac';

UPDATE public.orgs
SET use_new_rbac = true
WHERE use_new_rbac IS DISTINCT FROM true;

ALTER TABLE public.orgs
  ALTER COLUMN use_new_rbac SET DEFAULT true;

CREATE OR REPLACE FUNCTION public.rbac_is_enabled_for_org(p_org_id uuid) RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  PERFORM p_org_id;
  RETURN true;
END;
$$;

ALTER FUNCTION public.rbac_is_enabled_for_org(uuid) OWNER TO "postgres";
REVOKE ALL ON FUNCTION public.rbac_is_enabled_for_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rbac_is_enabled_for_org(uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.rbac_is_enabled_for_org(uuid) TO "service_role";

COMMENT ON FUNCTION public.rbac_is_enabled_for_org(uuid) IS 'Compatibility helper retained for old callers. RBAC is always enabled.';

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
  v_effective_org_id uuid := p_org_id;
  v_effective_user_id uuid := p_user_id;
  v_effective_app_id character varying := p_app_id;
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
      OR (p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM v_api_key.user_id)
      OR v_effective_org_id IS NULL
    THEN
      RETURN false;
    END IF;

    IF public.is_apikey_expired(v_api_key.expires_at) THEN
      RETURN false;
    END IF;

    v_effective_user_id := v_api_key.user_id;

    IF (SELECT enforcing_2fa FROM public.orgs WHERE id = v_effective_org_id)
      AND NOT public.has_2fa_enabled(v_effective_user_id)
    THEN
      RETURN false;
    END IF;

    IF public.user_meets_password_policy(v_effective_user_id, v_effective_org_id) = false THEN
      RETURN false;
    END IF;

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

  IF v_effective_user_id IS NULL THEN
    RETURN false;
  END IF;

  v_allowed := public.rbac_has_permission(
    public.rbac_principal_user(),
    v_effective_user_id,
    p_permission_key,
    v_effective_org_id,
    v_effective_app_id,
    p_channel_id
  );

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
  v_effective_org_id uuid := p_org_id;
  v_effective_user_id uuid := p_user_id;
  v_effective_app_id character varying := p_app_id;
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
      OR (p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM v_api_key.user_id)
      OR v_effective_org_id IS NULL
    THEN
      RETURN false;
    END IF;

    IF public.is_apikey_expired(v_api_key.expires_at) THEN
      RETURN false;
    END IF;

    v_effective_user_id := v_api_key.user_id;

    IF (SELECT enforcing_2fa FROM public.orgs WHERE id = v_effective_org_id)
      AND NOT public.has_2fa_enabled(v_effective_user_id)
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
END;
$$;

ALTER FUNCTION "public"."rbac_check_permission_direct_no_password_policy"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."check_min_rights"(
  "min_right" "public"."user_min_right",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) RETURNS boolean
LANGUAGE "plpgsql"
SET search_path = ''
AS $$
BEGIN
  RETURN public.check_min_rights(min_right, (SELECT auth.uid()), org_id, app_id, channel_id);
END;
$$;

ALTER FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."check_min_rights"(
  "min_right" "public"."user_min_right",
  "user_id" "uuid",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) RETURNS boolean
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_perm text;
  v_scope text;
  v_apikey text;
  v_effective_org_id uuid := org_id;
  v_app_owner_org uuid;
  v_org_enforcing_2fa boolean;
  v_password_policy_ok boolean;
BEGIN
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

  IF v_effective_org_id IS NULL AND channel_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id
    FROM public.channels
    WHERE public.channels.id = channel_id
    LIMIT 1;
  END IF;

  SELECT public.get_apikey_header() INTO v_apikey;

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

  IF channel_id IS NOT NULL THEN
    v_scope := public.rbac_scope_channel();
  ELSIF app_id IS NOT NULL THEN
    v_scope := public.rbac_scope_app();
  ELSE
    v_scope := public.rbac_scope_org();
  END IF;

  v_perm := public.rbac_permission_for_legacy(min_right, v_scope);
  RETURN public.rbac_check_permission_direct(v_perm, user_id, v_effective_org_id, app_id, channel_id, v_apikey);
END;
$$;

ALTER FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."check_min_rights_legacy"(
  "min_right" "public"."user_min_right",
  "user_id" "uuid",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) RETURNS boolean
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.check_min_rights(min_right, user_id, org_id, app_id, channel_id);
END;
$$;

ALTER FUNCTION "public"."check_min_rights_legacy"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."check_min_rights_legacy"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."check_min_rights_legacy"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."check_min_rights_legacy_no_password_policy"(
  "min_right" "public"."user_min_right",
  "user_id" "uuid",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) RETURNS boolean
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_perm text;
  v_scope text;
BEGIN
  IF channel_id IS NOT NULL THEN
    v_scope := public.rbac_scope_channel();
  ELSIF app_id IS NOT NULL THEN
    v_scope := public.rbac_scope_app();
  ELSE
    v_scope := public.rbac_scope_org();
  END IF;

  v_perm := public.rbac_permission_for_legacy(min_right, v_scope);
  RETURN public.rbac_check_permission_direct_no_password_policy(v_perm, user_id, org_id, app_id, channel_id, NULL);
END;
$$;

ALTER FUNCTION "public"."check_min_rights_legacy_no_password_policy"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."check_min_rights_legacy_no_password_policy"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."check_min_rights_legacy_no_password_policy"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "service_role";

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
    IF api_key.id IS NULL THEN
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;
    IF public.is_apikey_expired(api_key.expires_at) THEN
      RAISE EXCEPTION 'API key has expired';
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

    UNION

    SELECT ou.org_id AS org_uuid
    FROM public.org_users ou
    WHERE ou.user_id = v_user_id
      AND ou.user_right::text LIKE 'invite_%'
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
    IF v_api_key.id IS NULL THEN
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;
    IF public.is_apikey_expired(v_api_key.expires_at) THEN
      RAISE EXCEPTION 'API key has expired';
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

CREATE OR REPLACE FUNCTION "public"."get_orgs_v7"("userid" "uuid") RETURNS TABLE("gid" "uuid", "created_by" "uuid", "created_at" timestamp with time zone, "logo" "text", "website" "text", "name" "text", "role" character varying, "paying" boolean, "trial_left" integer, "can_use_more" boolean, "is_canceled" boolean, "app_count" bigint, "subscription_start" timestamp with time zone, "subscription_end" timestamp with time zone, "management_email" "text", "is_yearly" boolean, "stats_updated_at" timestamp without time zone, "stats_refresh_requested_at" timestamp without time zone, "next_stats_update_at" timestamp with time zone, "credit_available" numeric, "credit_total" numeric, "credit_next_expiration" timestamp with time zone, "enforcing_2fa" boolean, "2fa_has_access" boolean, "enforce_hashed_api_keys" boolean, "password_policy_config" "jsonb", "password_has_access" boolean, "require_apikey_expiration" boolean, "max_apikey_expiration_days" integer, "enforce_encrypted_bundles" boolean, "required_encryption_key" character varying, "use_new_rbac" boolean)
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH app_counts AS (
    SELECT owner_org, COUNT(*) AS cnt
    FROM public.apps
    GROUP BY owner_org
  ),
  rbac_role_candidates AS (
    SELECT rb.org_id, r.name, r.priority_rank
    FROM public.role_bindings rb
    JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = userid
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION ALL
    SELECT rb.org_id, r.name, r.priority_rank
    FROM public.role_bindings rb
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = userid
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ),
  rbac_org_roles AS (
    SELECT org_id, (ARRAY_AGG(rbac_role_candidates.name ORDER BY rbac_role_candidates.priority_rank DESC))[1] AS role_name
    FROM rbac_role_candidates
    GROUP BY org_id
  ),
  rbac_org_ids AS (
    SELECT org_id
    FROM rbac_org_roles
    UNION
    SELECT apps.owner_org
    FROM public.role_bindings rb
    JOIN public.apps ON apps.id = rb.app_id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = userid
      AND rb.app_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    SELECT apps.owner_org
    FROM public.role_bindings rb
    JOIN public.channels ch ON ch.rbac_id = rb.channel_id
    JOIN public.apps ON apps.app_id = ch.app_id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = userid
      AND rb.channel_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    SELECT rb.org_id
    FROM public.role_bindings rb
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = userid
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    SELECT apps.owner_org
    FROM public.role_bindings rb
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    JOIN public.apps ON apps.id = rb.app_id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = userid
      AND rb.app_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    SELECT apps.owner_org
    FROM public.role_bindings rb
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    JOIN public.channels ch ON ch.rbac_id = rb.channel_id
    JOIN public.apps ON apps.app_id = ch.app_id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = userid
      AND rb.channel_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ),
  user_orgs AS (
    SELECT rbac_org_ids.org_id
    FROM rbac_org_ids
    WHERE rbac_org_ids.org_id IS NOT NULL
    UNION
    SELECT ou.org_id
    FROM public.org_users ou
    WHERE ou.user_id = userid
      AND ou.user_right::text LIKE 'invite_%'
  ),
  time_constants AS (
    SELECT
      NOW() AS current_time,
      date_trunc('MONTH', NOW()) AS current_month_start,
      '0 DAYS'::INTERVAL AS zero_day_interval
  ),
  paying_orgs_ordered AS (
    SELECT
      o.id,
      ROW_NUMBER() OVER (ORDER BY o.id ASC) - 1 AS preceding_count
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    CROSS JOIN time_constants tc
    WHERE (
      (si.status = 'succeeded'
        AND (si.canceled_at IS NULL OR si.canceled_at > tc.current_time)
        AND si.subscription_anchor_end > tc.current_time)
      OR si.trial_at > tc.current_time
    )
  ),
  billing_cycles AS (
    SELECT
      o.id AS org_id,
      CASE
        WHEN COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), tc.zero_day_interval)
             > tc.current_time - tc.current_month_start
        THEN date_trunc('MONTH', tc.current_time - INTERVAL '1 MONTH')
             + COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), tc.zero_day_interval)
        ELSE tc.current_month_start
             + COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), tc.zero_day_interval)
      END AS cycle_start
    FROM public.orgs o
    CROSS JOIN time_constants tc
    LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  ),
  two_fa_access AS (
    SELECT
      o.id AS org_id,
      o.enforcing_2fa,
      CASE
        WHEN o.enforcing_2fa = false THEN true
        ELSE public.has_2fa_enabled(userid)
      END AS "2fa_has_access",
      (o.enforcing_2fa = true AND NOT public.has_2fa_enabled(userid)) AS should_redact_2fa
    FROM public.orgs o
    JOIN user_orgs uo ON uo.org_id = o.id
  ),
  password_policy_access AS (
    SELECT
      o.id AS org_id,
      o.password_policy_config,
      public.user_meets_password_policy(userid, o.id) AS password_has_access,
      NOT public.user_meets_password_policy(userid, o.id) AS should_redact_password
    FROM public.orgs o
    JOIN user_orgs uo ON uo.org_id = o.id
  )
  SELECT
    o.id AS gid,
    o.created_by,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::timestamptz
      ELSE o.created_at
    END AS created_at,
    o.logo,
    o.website,
    o.name,
    COALESCE(ou.user_right::varchar, ror.role_name::varchar, public.rbac_role_org_member()::varchar) AS role,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE COALESCE(si.status = 'succeeded', false)
    END AS paying,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN 0
      ELSE GREATEST(COALESCE((si.trial_at::date - NOW()::date), 0), 0)::integer
    END AS trial_left,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE COALESCE((si.status = 'succeeded' AND si.is_good_plan = true)
        OR (si.trial_at::date - NOW()::date > 0)
        OR COALESCE(ucb.available_credits, 0) > 0, false)
    END AS can_use_more,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE COALESCE(si.status = 'canceled', false)
    END AS is_canceled,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN 0::bigint
      ELSE COALESCE(ac.cnt, 0)
    END AS app_count,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::timestamptz
      ELSE bc.cycle_start
    END AS subscription_start,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::timestamptz
      ELSE (bc.cycle_start + INTERVAL '1 MONTH')
    END AS subscription_end,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::text
      ELSE o.management_email
    END AS management_email,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE COALESCE(si.price_id = p.price_y_id, false)
    END AS is_yearly,
    o.stats_updated_at,
    o.stats_refresh_requested_at,
    CASE
      WHEN poo.id IS NOT NULL THEN
        public.get_next_cron_time('0 3 * * *', NOW()) + make_interval(mins => poo.preceding_count::int * 4)
      ELSE NULL
    END AS next_stats_update_at,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::numeric
      ELSE COALESCE(ucb.available_credits, 0)
    END AS credit_available,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::numeric
      ELSE COALESCE(ucb.total_credits, 0)
    END AS credit_total,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::timestamptz
      ELSE ucb.next_expiration
    END AS credit_next_expiration,
    tfa.enforcing_2fa,
    tfa."2fa_has_access",
    o.enforce_hashed_api_keys,
    ppa.password_policy_config,
    ppa.password_has_access,
    o.require_apikey_expiration,
    o.max_apikey_expiration_days,
    o.enforce_encrypted_bundles,
    o.required_encryption_key,
    true AS use_new_rbac
  FROM public.orgs o
  JOIN user_orgs uo ON uo.org_id = o.id
  LEFT JOIN public.org_users ou
    ON ou.user_id = userid
    AND o.id = ou.org_id
    AND ou.user_right::text LIKE 'invite_%'
  LEFT JOIN rbac_org_roles ror ON ror.org_id = o.id
  LEFT JOIN two_fa_access tfa ON tfa.org_id = o.id
  LEFT JOIN password_policy_access ppa ON ppa.org_id = o.id
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  LEFT JOIN public.plans p ON si.product_id = p.stripe_id
  LEFT JOIN app_counts ac ON ac.owner_org = o.id
  LEFT JOIN public.usage_credit_balances ucb ON ucb.org_id = o.id
  LEFT JOIN paying_orgs_ordered poo ON poo.id = o.id
  LEFT JOIN billing_cycles bc ON bc.org_id = o.id;
END;
$$;

ALTER FUNCTION "public"."get_orgs_v7"("userid" "uuid") OWNER TO "postgres";

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
    IF v_api_key.id IS NULL THEN
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;
    IF public.is_apikey_expired(v_api_key.expires_at) THEN
      RAISE EXCEPTION 'API key has expired';
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

CREATE OR REPLACE FUNCTION "public"."rbac_org_role_for_legacy_right"("legacy_right" "public"."user_min_right")
RETURNS text
LANGUAGE "plpgsql"
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF legacy_right >= public.rbac_right_super_admin()::public.user_min_right THEN
    RETURN public.rbac_role_org_super_admin();
  ELSIF legacy_right >= public.rbac_right_admin()::public.user_min_right THEN
    RETURN public.rbac_role_org_admin();
  END IF;

  RETURN public.rbac_role_org_member();
END;
$$;

ALTER FUNCTION "public"."rbac_org_role_for_legacy_right"("public"."user_min_right") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."rbac_org_role_for_legacy_right"("public"."user_min_right") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."rbac_org_role_for_legacy_right"("public"."user_min_right") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."invite_user_to_org_rbac"("email" character varying, "org_id" "uuid", "role_name" "text") RETURNS character varying
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  org record;
  invited_user record;
  current_record record;
  current_tmp_user record;
  role_id uuid;
  role_priority integer;
  caller_max_priority integer := 0;
  legacy_right public.user_min_right;
  invite_right public.user_min_right;
  api_key_text text;
  api_key_row public.apikeys%ROWTYPE;
  v_granted_by uuid;
  v_principal_type text;
  v_principal_id uuid;
BEGIN
  SELECT * INTO org FROM public.orgs WHERE public.orgs.id = invite_user_to_org_rbac.org_id;
  IF org IS NULL THEN
    RETURN 'NO_ORG';
  END IF;

  SELECT r.id, r.priority_rank INTO role_id, role_priority
  FROM public.roles r
  WHERE r.name = invite_user_to_org_rbac.role_name
    AND r.scope_type = public.rbac_scope_org()
    AND r.is_assignable = true
  LIMIT 1;

  IF role_id IS NULL THEN
    RETURN 'ROLE_NOT_FOUND';
  END IF;

  SELECT public.get_apikey_header() INTO api_key_text;
  IF api_key_text IS NOT NULL THEN
    SELECT * INTO api_key_row FROM public.find_apikey_by_value(api_key_text) LIMIT 1;
    v_granted_by := api_key_row.user_id;
    v_principal_type := public.rbac_principal_apikey();
    v_principal_id := api_key_row.rbac_id;
  ELSE
    v_granted_by := auth.uid();
    v_principal_type := public.rbac_principal_user();
    v_principal_id := auth.uid();
  END IF;

  IF invite_user_to_org_rbac.role_name = public.rbac_role_org_super_admin() THEN
    IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_update_user_roles(), auth.uid(), invite_user_to_org_rbac.org_id, NULL, NULL, api_key_text) THEN
      RETURN 'NO_RIGHTS';
    END IF;
  ELSE
    IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_invite_user(), auth.uid(), invite_user_to_org_rbac.org_id, NULL, NULL, api_key_text) THEN
      RETURN 'NO_RIGHTS';
    END IF;
  END IF;

  IF v_principal_id IS NULL THEN
    RETURN 'NO_RIGHTS';
  END IF;

  SELECT COALESCE(MAX(r.priority_rank), 0) INTO caller_max_priority
  FROM public.role_bindings rb
  JOIN public.roles r
    ON r.id = rb.role_id
    AND r.scope_type = rb.scope_type
  WHERE rb.principal_type = v_principal_type
    AND rb.principal_id = v_principal_id
    AND rb.org_id = invite_user_to_org_rbac.org_id
    AND (rb.expires_at IS NULL OR rb.expires_at > now());

  IF caller_max_priority < role_priority THEN
    RETURN 'NO_RIGHTS';
  END IF;

  legacy_right := public.rbac_legacy_right_for_org_role(invite_user_to_org_rbac.role_name);
  invite_right := public.transform_role_to_invite(legacy_right);

  SELECT public.users.id INTO invited_user FROM public.users WHERE public.users.email = invite_user_to_org_rbac.email;

  IF invited_user IS NOT NULL THEN
    SELECT public.org_users.id INTO current_record
    FROM public.org_users
    WHERE public.org_users.user_id = invited_user.id
      AND public.org_users.org_id = invite_user_to_org_rbac.org_id;

    IF current_record IS NOT NULL THEN
      RETURN 'ALREADY_INVITED';
    ELSE
      INSERT INTO public.org_users (user_id, org_id, user_right, rbac_role_name)
      VALUES (invited_user.id, invite_user_to_org_rbac.org_id, invite_right, invite_user_to_org_rbac.role_name);

      RETURN 'OK';
    END IF;
  ELSE
    SELECT * INTO current_tmp_user
    FROM public.tmp_users
    WHERE public.tmp_users.email = invite_user_to_org_rbac.email
      AND public.tmp_users.org_id = invite_user_to_org_rbac.org_id;

    IF current_tmp_user IS NOT NULL THEN
      IF current_tmp_user.cancelled_at IS NOT NULL THEN
        IF current_tmp_user.cancelled_at > (CURRENT_TIMESTAMP - INTERVAL '3 hours') THEN
          RETURN 'TOO_RECENT_INVITATION_CANCELATION';
        ELSE
          RETURN 'NO_EMAIL';
        END IF;
      ELSE
        RETURN 'ALREADY_INVITED';
      END IF;
    ELSE
      RETURN 'NO_EMAIL';
    END IF;
  END IF;
END;
$$;

ALTER FUNCTION "public"."invite_user_to_org_rbac"("email" character varying, "org_id" "uuid", "role_name" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."invite_user_to_org"(
  "email" character varying,
  "org_id" "uuid",
  "invite_type" "public"."user_min_right"
) RETURNS character varying
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  legacy_right public.user_min_right;
  role_name text;
BEGIN
  legacy_right := public.transform_role_to_non_invite(invite_type);
  role_name := public.rbac_org_role_for_legacy_right(legacy_right);

  RETURN public.invite_user_to_org_rbac(email, org_id, role_name);
END;
$$;

ALTER FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") TO "service_role";

COMMENT ON FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") IS 'Compatibility wrapper for old invite callers. Legacy role inputs are converted to RBAC roles.';

CREATE OR REPLACE FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") RETURNS character varying
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  invite public.org_users%ROWTYPE;
  legacy_right public.user_min_right;
  role_name text;
  role_id uuid;
BEGIN
  SELECT public.org_users.*
  INTO invite
  FROM public.org_users
  WHERE public.org_users.org_id = accept_invitation_to_org.org_id
    AND public.org_users.user_id = (SELECT auth.uid())
    AND public.org_users.user_right::text LIKE 'invite_%'
  ORDER BY public.org_users.created_at DESC NULLS LAST, public.org_users.id DESC
  LIMIT 1;

  IF invite.id IS NULL THEN
    RETURN 'NO_INVITE';
  END IF;

  legacy_right := public.transform_role_to_non_invite(invite.user_right);
  role_name := COALESCE(invite.rbac_role_name, public.rbac_org_role_for_legacy_right(legacy_right));

  IF role_name IS NULL THEN
    RETURN 'ROLE_NOT_FOUND';
  END IF;

  SELECT public.roles.id INTO role_id
  FROM public.roles
  WHERE public.roles.name = role_name
    AND public.roles.scope_type = public.rbac_scope_org()
    AND public.roles.is_assignable = true
  LIMIT 1;

  IF role_id IS NULL THEN
    RETURN 'ROLE_NOT_FOUND';
  END IF;

  UPDATE public.org_users
  SET user_right = legacy_right,
      rbac_role_name = role_name,
      updated_at = CURRENT_TIMESTAMP
  WHERE public.org_users.id = invite.id;

  DELETE FROM public.role_bindings
  WHERE public.role_bindings.principal_type = public.rbac_principal_user()
    AND public.role_bindings.principal_id = invite.user_id
    AND public.role_bindings.scope_type = public.rbac_scope_org()
    AND public.role_bindings.org_id = invite.org_id;

  INSERT INTO public.role_bindings (
    principal_type,
    principal_id,
    role_id,
    scope_type,
    org_id,
    app_id,
    channel_id,
    granted_by,
    granted_at,
    reason,
    is_direct
  ) VALUES (
    public.rbac_principal_user(),
    invite.user_id,
    role_id,
    public.rbac_scope_org(),
    invite.org_id,
    NULL,
    NULL,
    auth.uid(),
    now(),
    'Accepted invitation',
    true
  ) ON CONFLICT DO NOTHING;

  RETURN 'OK';
END;
$$;

ALTER FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") TO "service_role";

COMMENT ON FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") IS 'Accepts a pending org invite and creates the active RBAC binding. Kept for old clients.';

CREATE OR REPLACE FUNCTION "public"."modify_permissions_tmp"(
  "email" "text",
  "org_id" "uuid",
  "new_role" "public"."user_min_right"
) RETURNS character varying
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  tmp_user record;
  non_invite_role public.user_min_right;
  v_rbac_role_name text;
BEGIN
  non_invite_role := public.transform_role_to_non_invite(new_role);
  v_rbac_role_name := public.rbac_org_role_for_legacy_right(non_invite_role);

  PERFORM 1 FROM public.orgs WHERE public.orgs.id = modify_permissions_tmp.org_id;
  IF NOT FOUND THEN
    RETURN 'NO_ORG';
  END IF;

  IF NOT public.check_min_rights(
    'admin'::public.user_min_right,
    (SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], modify_permissions_tmp.org_id)),
    modify_permissions_tmp.org_id,
    NULL::varchar,
    NULL::bigint
  ) THEN
    RETURN 'NO_RIGHTS';
  END IF;

  IF non_invite_role = 'super_admin'::public.user_min_right
    AND NOT public.check_min_rights(
      'super_admin'::public.user_min_right,
      (SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], modify_permissions_tmp.org_id)),
      modify_permissions_tmp.org_id,
      NULL::varchar,
      NULL::bigint
    )
  THEN
    RETURN 'NO_RIGHTS_FOR_SUPER_ADMIN';
  END IF;

  SELECT * INTO tmp_user
  FROM public.tmp_users
  WHERE public.tmp_users.email = modify_permissions_tmp.email
    AND public.tmp_users.org_id = modify_permissions_tmp.org_id;

  IF NOT FOUND THEN
    RETURN 'NO_INVITATION';
  END IF;
  IF tmp_user.cancelled_at IS NOT NULL THEN
    RETURN 'INVITATION_CANCELLED';
  END IF;

  UPDATE public.tmp_users
  SET role = non_invite_role,
      rbac_role_name = v_rbac_role_name,
      updated_at = CURRENT_TIMESTAMP
  WHERE public.tmp_users.id = tmp_user.id;

  RETURN 'OK';
END;
$$;

ALTER FUNCTION "public"."modify_permissions_tmp"("email" "text", "org_id" "uuid", "new_role" "public"."user_min_right") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."modify_permissions_tmp"("email" "text", "org_id" "uuid", "new_role" "public"."user_min_right") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."modify_permissions_tmp"("email" "text", "org_id" "uuid", "new_role" "public"."user_min_right") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."modify_permissions_tmp"("email" "text", "org_id" "uuid", "new_role" "public"."user_min_right") TO "service_role";

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
