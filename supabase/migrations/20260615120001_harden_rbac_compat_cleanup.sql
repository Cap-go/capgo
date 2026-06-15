-- RBAC is now always on. Remove the old org opt-in flag entirely so it cannot
-- act as a downgrade switch or appear as an authorization source.
DROP TRIGGER IF EXISTS force_org_rbac_enabled ON public.orgs;
DROP POLICY IF EXISTS "Deny disabling RBAC flag on org insert" ON "public"."orgs";
DROP POLICY IF EXISTS "Deny disabling RBAC flag on org update" ON "public"."orgs";
DROP FUNCTION IF EXISTS public.force_org_rbac_enabled();
DROP FUNCTION IF EXISTS public.rbac_is_enabled_for_org(uuid);
DROP FUNCTION IF EXISTS public.rbac_enable_for_org(uuid, uuid);
DROP FUNCTION IF EXISTS public.rbac_rollback_org(uuid);

ALTER TABLE public.orgs
  DROP COLUMN IF EXISTS use_new_rbac;

-- Direct channel table updates are intentionally admin/channel-admin only.
-- App developers can upload/promote bundles, but must not mutate channel settings
-- through the anon API-key RLS path.
DELETE FROM public.role_permissions
USING public.roles, public.permissions
WHERE role_permissions.role_id = roles.id
  AND role_permissions.permission_id = permissions.id
  AND roles.name = public.rbac_role_app_developer()
  AND permissions.key = public.rbac_perm_channel_update_settings();

DROP POLICY IF EXISTS "Allow update for auth (admin+)" ON public.orgs;
DROP POLICY IF EXISTS "Allow org settings update via RBAC" ON public.orgs;
CREATE POLICY "Allow org settings update via RBAC"
ON public.orgs
FOR UPDATE
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_org_update_settings(),
    id,
    NULL::character varying,
    NULL::bigint
  )
)
WITH CHECK (
  public.rbac_check_permission_request(
    public.rbac_perm_org_update_settings(),
    id,
    NULL::character varying,
    NULL::bigint
  )
  AND ((enforcing_2fa IS NOT TRUE) OR public.has_2fa_enabled())
);

CREATE OR REPLACE FUNCTION public.rbac_check_permission_direct(
  p_permission_key text,
  p_user_id uuid,
  p_org_id uuid,
  p_app_id character varying,
  p_channel_id bigint,
  p_apikey text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_allowed boolean := false;
  v_effective_org_id uuid := p_org_id;
  v_effective_user_id uuid := p_user_id;
  v_effective_app_id character varying := p_app_id;
  v_api_key public.apikeys%ROWTYPE;
  v_app_owner_org uuid;
  v_channel_org_id uuid;
  v_channel_app_id character varying;
  v_channel_scope boolean := p_channel_id IS NOT NULL;
  v_override boolean;
BEGIN
  IF p_permission_key IS NULL OR p_permission_key = '' THEN
    RETURN false;
  END IF;

  IF p_app_id IS NOT NULL THEN
    SELECT owner_org INTO v_app_owner_org
    FROM public.apps
    WHERE app_id = p_app_id
    LIMIT 1;

    IF v_app_owner_org IS NULL THEN
      RETURN false;
    END IF;

    IF v_effective_org_id IS NOT NULL AND v_effective_org_id IS DISTINCT FROM v_app_owner_org THEN
      RETURN false;
    END IF;

    v_effective_org_id := v_app_owner_org;
  END IF;

  IF p_channel_id IS NOT NULL THEN
    SELECT owner_org, app_id
    INTO v_channel_org_id, v_channel_app_id
    FROM public.channels
    WHERE id = p_channel_id
    LIMIT 1;

    IF v_channel_org_id IS NULL THEN
      RETURN false;
    END IF;

    IF v_effective_org_id IS NOT NULL AND v_effective_org_id IS DISTINCT FROM v_channel_org_id THEN
      RETURN false;
    END IF;

    IF v_effective_app_id IS NOT NULL AND v_effective_app_id IS DISTINCT FROM v_channel_app_id THEN
      RETURN false;
    END IF;

    v_effective_org_id := v_channel_org_id;
    v_effective_app_id := v_channel_app_id;
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

ALTER FUNCTION public.rbac_check_permission_direct(text, uuid, uuid, character varying, bigint, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rbac_check_permission_direct(text, uuid, uuid, character varying, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rbac_check_permission_direct(text, uuid, uuid, character varying, bigint, text) TO service_role;

CREATE OR REPLACE FUNCTION public.rbac_check_permission_direct_no_password_policy(
  p_permission_key text,
  p_user_id uuid,
  p_org_id uuid,
  p_app_id character varying,
  p_channel_id bigint,
  p_apikey text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_effective_org_id uuid := p_org_id;
  v_effective_user_id uuid := p_user_id;
  v_effective_app_id character varying := p_app_id;
  v_api_key public.apikeys%ROWTYPE;
  v_app_owner_org uuid;
  v_channel_org_id uuid;
  v_channel_app_id character varying;
BEGIN
  IF p_permission_key IS NULL OR p_permission_key = '' THEN
    RETURN false;
  END IF;

  IF p_app_id IS NOT NULL THEN
    SELECT owner_org INTO v_app_owner_org
    FROM public.apps
    WHERE app_id = p_app_id
    LIMIT 1;

    IF v_app_owner_org IS NULL THEN
      RETURN false;
    END IF;

    IF v_effective_org_id IS NOT NULL AND v_effective_org_id IS DISTINCT FROM v_app_owner_org THEN
      RETURN false;
    END IF;

    v_effective_org_id := v_app_owner_org;
  END IF;

  IF p_channel_id IS NOT NULL THEN
    SELECT owner_org, app_id
    INTO v_channel_org_id, v_channel_app_id
    FROM public.channels
    WHERE id = p_channel_id
    LIMIT 1;

    IF v_channel_org_id IS NULL THEN
      RETURN false;
    END IF;

    IF v_effective_org_id IS NOT NULL AND v_effective_org_id IS DISTINCT FROM v_channel_org_id THEN
      RETURN false;
    END IF;

    IF v_effective_app_id IS NOT NULL AND v_effective_app_id IS DISTINCT FROM v_channel_app_id THEN
      RETURN false;
    END IF;

    v_effective_org_id := v_channel_org_id;
    v_effective_app_id := v_channel_app_id;
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

ALTER FUNCTION public.rbac_check_permission_direct_no_password_policy(text, uuid, uuid, character varying, bigint, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rbac_check_permission_direct_no_password_policy(text, uuid, uuid, character varying, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rbac_check_permission_direct_no_password_policy(text, uuid, uuid, character varying, bigint, text) TO service_role;

COMMENT ON FUNCTION public.rbac_check_permission_direct(text, uuid, uuid, character varying, bigint, text) IS
  'Direct RBAC permission check. Uses role_bindings only, supports hashed API keys via find_apikey_by_value, and applies channel overrides.';

COMMENT ON FUNCTION public.rbac_check_permission_request(text, uuid, character varying, bigint) IS
  'Request-aware RBAC permission wrapper for RLS and SQL callers. Uses auth.uid() and the API key request header.';

COMMENT ON FUNCTION public.rbac_check_permission(text, uuid, character varying, bigint) IS
  'Public RBAC permission check for authenticated users. Uses auth.uid() and delegates to rbac_check_permission_direct.';

CREATE OR REPLACE FUNCTION public.user_has_app_update_user_roles(p_user_id uuid, p_app_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_app_id_varchar text;
  v_org_id uuid;
  v_caller_id uuid;
BEGIN
  SELECT auth.uid() INTO v_caller_id;

  IF v_caller_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT apps.app_id, apps.owner_org
  INTO v_app_id_varchar, v_org_id
  FROM public.apps
  WHERE apps.id = p_app_id
  LIMIT 1;

  IF v_app_id_varchar IS NULL OR v_org_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_caller_id <> p_user_id THEN
    IF NOT public.rbac_check_permission_direct(
      public.rbac_perm_app_update_user_roles(),
      v_caller_id,
      v_org_id,
      v_app_id_varchar,
      NULL::bigint,
      NULL::text
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN public.rbac_check_permission_direct(
    public.rbac_perm_app_update_user_roles(),
    p_user_id,
    v_org_id,
    v_app_id_varchar,
    NULL::bigint,
    NULL::text
  );
END;
$$;

ALTER FUNCTION public.user_has_app_update_user_roles(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.user_has_app_update_user_roles(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_has_app_update_user_roles(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_has_app_update_user_roles(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_app_update_user_roles(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.user_has_app_update_user_roles(uuid, uuid) IS
  'Checks app.update_user_roles using RBAC only. The caller must be the checked user or already hold the same RBAC permission.';

CREATE OR REPLACE FUNCTION capgo_private.matches_app_storage_rbac_owner(
  folder_user_id text,
  target_app_id character varying,
  permission_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_apikey text;
  v_api_key public.apikeys%ROWTYPE;
  v_owner_org uuid;
BEGIN
  SELECT public.get_apikey_header() INTO v_apikey;

  IF v_apikey IS NULL OR v_apikey = '' THEN
    RETURN false;
  END IF;

  SELECT * INTO v_api_key
  FROM public.find_apikey_by_value(v_apikey)
  LIMIT 1;

  IF v_api_key.id IS NULL
    OR public.is_apikey_expired(v_api_key.expires_at)
    OR v_api_key.user_id::text IS DISTINCT FROM folder_user_id
  THEN
    RETURN false;
  END IF;

  SELECT owner_org INTO v_owner_org
  FROM public.apps
  WHERE app_id = target_app_id
  LIMIT 1;

  IF v_owner_org IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.rbac_check_permission_direct(
    permission_key,
    v_api_key.user_id,
    v_owner_org,
    target_app_id,
    NULL::bigint,
    v_apikey
  );
END;
$$;

ALTER FUNCTION capgo_private.matches_app_storage_rbac_owner(text, character varying, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION capgo_private.matches_app_storage_rbac_owner(text, character varying, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private.matches_app_storage_rbac_owner(text, character varying, text) TO anon;
GRANT EXECUTE ON FUNCTION capgo_private.matches_app_storage_rbac_owner(text, character varying, text) TO authenticated;
GRANT EXECUTE ON FUNCTION capgo_private.matches_app_storage_rbac_owner(text, character varying, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_user_main_org_id_by_app_id(app_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_org uuid;
BEGIN
  SELECT apps.owner_org INTO v_owner_org
  FROM public.apps
  WHERE apps.app_id = get_user_main_org_id_by_app_id.app_id
  LIMIT 1;

  IF v_owner_org IS NULL THEN
    RETURN NULL;
  END IF;

  IF public.rbac_check_permission_request(
    public.rbac_perm_app_read(),
    v_owner_org,
    get_user_main_org_id_by_app_id.app_id,
    NULL::bigint
  ) THEN
    RETURN v_owner_org;
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION public.get_user_main_org_id_by_app_id(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_user_main_org_id_by_app_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_main_org_id_by_app_id(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_main_org_id_by_app_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_main_org_id_by_app_id(text) TO service_role;

CREATE OR REPLACE FUNCTION public.request_has_org_read_access(orgid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.rbac_check_permission_request(
    public.rbac_perm_org_read(),
    request_has_org_read_access.orgid,
    NULL::character varying,
    NULL::bigint
  );
END;
$$;

ALTER FUNCTION public.request_has_org_read_access(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.request_has_org_read_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_has_org_read_access(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.request_has_org_read_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_has_org_read_access(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.request_has_app_read_access(orgid uuid, appid character varying)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.rbac_check_permission_request(
    public.rbac_perm_app_read(),
    request_has_app_read_access.orgid,
    request_has_app_read_access.appid,
    NULL::bigint
  );
END;
$$;

ALTER FUNCTION public.request_has_app_read_access(uuid, character varying) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.request_has_app_read_access(uuid, character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_has_app_read_access(uuid, character varying) TO anon;
GRANT EXECUTE ON FUNCTION public.request_has_app_read_access(uuid, character varying) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_has_app_read_access(uuid, character varying) TO service_role;

CREATE OR REPLACE FUNCTION public.usage_credit_readable_org_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(pg_catalog.array_agg(DISTINCT orgs.id), '{}'::uuid[])
  FROM public.orgs
  WHERE public.rbac_check_permission_request(
    public.rbac_perm_org_read_billing(),
    orgs.id,
    NULL::character varying,
    NULL::bigint
  );
$$;

ALTER FUNCTION public.usage_credit_readable_org_ids() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.usage_credit_readable_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.usage_credit_readable_org_ids() TO anon;
GRANT EXECUTE ON FUNCTION public.usage_credit_readable_org_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.usage_credit_readable_org_ids() TO service_role;

COMMENT ON FUNCTION public.usage_credit_readable_org_ids() IS
  'Returns org IDs whose usage-credit rows are readable by the current user session or Capgo API key through RBAC billing-read permission checks.';

CREATE OR REPLACE FUNCTION public.audit_logs_allowed_orgs()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(pg_catalog.array_agg(DISTINCT orgs.id), '{}'::uuid[])
  FROM public.orgs
  WHERE public.rbac_check_permission_request(
    public.rbac_perm_org_read_audit(),
    orgs.id,
    NULL::character varying,
    NULL::bigint
  );
$$;

ALTER FUNCTION public.audit_logs_allowed_orgs() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.audit_logs_allowed_orgs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_logs_allowed_orgs() TO anon;
GRANT EXECUTE ON FUNCTION public.audit_logs_allowed_orgs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_logs_allowed_orgs() TO service_role;

DROP POLICY IF EXISTS "Allow owner to update own apikeys" ON public.apikeys;
DROP POLICY IF EXISTS "Deny client update on apikeys" ON public.apikeys;
CREATE POLICY "Deny client update on apikeys"
ON public.apikeys
AS RESTRICTIVE
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Allow all for auth (super_admin+)" ON public.app_versions;
CREATE POLICY "Allow RBAC app_versions super-admin access"
ON public.app_versions
FOR DELETE
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_bundle_delete(),
    owner_org,
    app_id,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow for auth, api keys (read+)" ON public.app_versions;
CREATE POLICY "Allow RBAC app_versions select"
ON public.app_versions
FOR SELECT
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_app_read_bundles(),
    owner_org,
    app_id,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow insert for api keys (write,all,upload) (upload+)" ON public.app_versions;
CREATE POLICY "Allow RBAC app_versions insert"
ON public.app_versions
FOR INSERT
TO anon
WITH CHECK (
  public.rbac_check_permission_request(
    public.rbac_perm_app_upload_bundle(),
    owner_org,
    app_id,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow update for auth and api keys" ON public.app_versions;
CREATE POLICY "Allow RBAC app_versions update"
ON public.app_versions
FOR UPDATE
TO anon, authenticated
USING (
  (
    deleted IS NOT TRUE
    AND (
      public.rbac_check_permission_request(
        public.rbac_perm_app_upload_bundle(),
        owner_org,
        app_id,
        NULL::bigint
      )
      OR public.rbac_check_permission_request(
        public.rbac_perm_bundle_update(),
        owner_org,
        app_id,
        NULL::bigint
      )
    )
  )
  OR public.rbac_check_permission_request(
    public.rbac_perm_bundle_delete(),
    owner_org,
    app_id,
    NULL::bigint
  )
)
WITH CHECK (
  (
    deleted IS NOT TRUE
    AND (
      public.rbac_check_permission_request(
        public.rbac_perm_app_upload_bundle(),
        owner_org,
        app_id,
        NULL::bigint
      )
      OR public.rbac_check_permission_request(
        public.rbac_perm_bundle_update(),
        owner_org,
        app_id,
        NULL::bigint
      )
    )
  )
  OR public.rbac_check_permission_request(
    public.rbac_perm_bundle_delete(),
    owner_org,
    app_id,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow read for auth (read+)" ON public.app_versions_meta;
CREATE POLICY "Allow RBAC app_versions_meta select"
ON public.app_versions_meta
FOR SELECT
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_app_read_bundles(),
    owner_org,
    app_id,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow all for auth (super_admin+)" ON public.apps;
CREATE POLICY "Allow RBAC apps super-admin access"
ON public.apps
FOR DELETE
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_app_delete(),
    owner_org,
    app_id,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow for auth, api keys (read+)" ON public.apps;
CREATE POLICY "Allow RBAC apps select"
ON public.apps
FOR SELECT
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_app_read(),
    owner_org,
    app_id,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow insert for apikey (write,all) (admin+)" ON public.apps;
CREATE POLICY "Allow RBAC apps insert"
ON public.apps
FOR INSERT
TO anon, authenticated
WITH CHECK (
  public.rbac_check_permission_request(
    public.rbac_perm_org_create_app(),
    owner_org,
    NULL::character varying,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow update for auth, api keys (write, all) (admin+)" ON public.apps;
CREATE POLICY "Allow RBAC apps update"
ON public.apps
FOR UPDATE
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_app_update_settings(),
    owner_org,
    app_id,
    NULL::bigint
  )
)
WITH CHECK (
  public.rbac_check_permission_request(
    public.rbac_perm_app_update_settings(),
    owner_org,
    app_id,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow org members to select build_logs" ON public.build_logs;
CREATE POLICY "Allow org members to select build_logs"
ON public.build_logs
FOR SELECT
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_app_read_logs(),
    org_id,
    app_id,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow org members to select build_requests" ON public.build_requests;
CREATE POLICY "Allow org members to select build_requests"
ON public.build_requests
FOR SELECT
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_app_read_logs(),
    owner_org,
    app_id,
    NULL::bigint
  )
);
ALTER TABLE public.channel_devices
  DROP CONSTRAINT IF EXISTS channel_devices_channel_id_fkey;

ALTER TABLE public.channel_devices
  ADD CONSTRAINT channel_devices_channel_id_fkey
  FOREIGN KEY (channel_id)
  REFERENCES public.channels(id)
  ON DELETE CASCADE;


DROP POLICY IF EXISTS "Allow delete for auth, api keys (write+)" ON public.channel_devices;
CREATE POLICY "Allow RBAC channel_devices delete"
ON public.channel_devices
FOR DELETE
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_channel_manage_forced_devices(),
    owner_org,
    app_id,
    channel_id
  )
);

DROP POLICY IF EXISTS "Allow insert for auth (write+)" ON public.channel_devices;
CREATE POLICY "Allow RBAC channel_devices insert"
ON public.channel_devices
FOR INSERT
TO anon, authenticated
WITH CHECK (
  public.rbac_check_permission_request(
    public.rbac_perm_channel_manage_forced_devices(),
    owner_org,
    app_id,
    channel_id
  )
);

DROP POLICY IF EXISTS "Allow read for auth, api keys (read+)" ON public.channel_devices;
CREATE POLICY "Allow RBAC channel_devices select"
ON public.channel_devices
FOR SELECT
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_channel_read_forced_devices(),
    owner_org,
    app_id,
    channel_id
  )
);

DROP POLICY IF EXISTS "Allow update for auth, api keys (write+)" ON public.channel_devices;
CREATE POLICY "Allow RBAC channel_devices update"
ON public.channel_devices
FOR UPDATE
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_channel_manage_forced_devices(),
    owner_org,
    app_id,
    channel_id
  )
)
WITH CHECK (
  public.rbac_check_permission_request(
    public.rbac_perm_channel_manage_forced_devices(),
    owner_org,
    app_id,
    channel_id
  )
);

DROP POLICY IF EXISTS "Allow delete for auth (admin+) (all apikey)" ON public.channels;
CREATE POLICY "Allow RBAC channels delete"
ON public.channels
FOR DELETE
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_channel_delete(),
    owner_org,
    app_id,
    id
  )
);

DROP POLICY IF EXISTS "Allow insert for auth, api keys (write, all) (admin+)" ON public.channels;
CREATE POLICY "Allow RBAC channels insert"
ON public.channels
FOR INSERT
TO anon, authenticated
WITH CHECK (
  public.rbac_check_permission_request(
    public.rbac_perm_app_create_channel(),
    owner_org,
    app_id,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow select for auth, api keys (read+)" ON public.channels;
CREATE POLICY "Allow RBAC channels select"
ON public.channels
FOR SELECT
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_channel_read(),
    owner_org,
    app_id,
    id
  )
);

DROP POLICY IF EXISTS "Allow update for auth, api keys (write, all) (write+)" ON public.channels;
CREATE POLICY "Allow RBAC channels update"
ON public.channels
FOR UPDATE
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_channel_update_settings(),
    owner_org,
    app_id,
    id
  )
)
WITH CHECK (
  public.rbac_check_permission_request(
    public.rbac_perm_channel_update_settings(),
    owner_org,
    app_id,
    id
  )
);

DROP POLICY IF EXISTS "Allow read for auth (read+)" ON public.daily_bandwidth;
CREATE POLICY "Allow RBAC daily_bandwidth select"
ON public.daily_bandwidth
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = daily_bandwidth.app_id
      AND public.rbac_check_permission_request(
        public.rbac_perm_app_read(),
        apps.owner_org,
        apps.app_id,
        NULL::bigint
      )
  )
);

DROP POLICY IF EXISTS "Allow org members to select daily_build_time" ON public.daily_build_time;
CREATE POLICY "Allow org members to select daily_build_time"
ON public.daily_build_time
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = daily_build_time.app_id
      AND public.rbac_check_permission_request(
        public.rbac_perm_app_read(),
        apps.owner_org,
        apps.app_id,
        NULL::bigint
      )
  )
);

DROP POLICY IF EXISTS "Allow read for auth (read+)" ON public.daily_mau;
CREATE POLICY "Allow RBAC daily_mau select"
ON public.daily_mau
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = daily_mau.app_id
      AND public.rbac_check_permission_request(
        public.rbac_perm_app_read(),
        apps.owner_org,
        apps.app_id,
        NULL::bigint
      )
  )
);

DROP POLICY IF EXISTS "Allow read for auth (read+)" ON public.daily_storage;
CREATE POLICY "Allow RBAC daily_storage select"
ON public.daily_storage
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = daily_storage.app_id
      AND public.rbac_check_permission_request(
        public.rbac_perm_app_read(),
        apps.owner_org,
        apps.app_id,
        NULL::bigint
      )
  )
);

DROP POLICY IF EXISTS "Allow read for auth (read+)" ON public.daily_storage_hourly;
CREATE POLICY "Allow RBAC daily_storage_hourly select"
ON public.daily_storage_hourly
FOR SELECT
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_app_read(),
    owner_org,
    app_id,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow read for auth (read+)" ON public.daily_version;
CREATE POLICY "Allow RBAC daily_version select"
ON public.daily_version
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = daily_version.app_id
      AND public.rbac_check_permission_request(
        public.rbac_perm_app_read(),
        apps.owner_org,
        apps.app_id,
        NULL::bigint
      )
  )
);

DROP POLICY IF EXISTS "Allow org member to insert devices" ON public.devices;
CREATE POLICY "Allow org member to insert devices"
ON public.devices
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = devices.app_id
      AND public.rbac_check_permission_request(
        public.rbac_perm_app_manage_devices(),
        apps.owner_org,
        apps.app_id,
        NULL::bigint
      )
  )
);

DROP POLICY IF EXISTS "Allow org member to select devices" ON public.devices;
CREATE POLICY "Allow org member to select devices"
ON public.devices
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = devices.app_id
      AND public.rbac_check_permission_request(
        public.rbac_perm_app_read_devices(),
        apps.owner_org,
        apps.app_id,
        NULL::bigint
      )
  )
);

DROP POLICY IF EXISTS "Allow org member to update devices" ON public.devices;
CREATE POLICY "Allow org member to update devices"
ON public.devices
FOR UPDATE
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = devices.app_id
      AND public.rbac_check_permission_request(
        public.rbac_perm_app_manage_devices(),
        apps.owner_org,
        apps.app_id,
        NULL::bigint
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = devices.app_id
      AND public.rbac_check_permission_request(
        public.rbac_perm_app_manage_devices(),
        apps.owner_org,
        apps.app_id,
        NULL::bigint
      )
  )
);

DROP POLICY IF EXISTS "group_members_delete" ON public.group_members;
CREATE POLICY "group_members_delete"
ON public.group_members
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.groups
    WHERE groups.id = group_members.group_id
      AND public.rbac_check_permission_request(
        public.rbac_perm_org_update_user_roles(),
        groups.org_id,
        NULL::character varying,
        NULL::bigint
      )
  )
);

DROP POLICY IF EXISTS "group_members_insert" ON public.group_members;
CREATE POLICY "group_members_insert"
ON public.group_members
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.groups
    WHERE groups.id = group_members.group_id
      AND public.rbac_check_permission_request(
        public.rbac_perm_org_update_user_roles(),
        groups.org_id,
        NULL::character varying,
        NULL::bigint
      )
  )
);

DROP POLICY IF EXISTS "group_members_update" ON public.group_members;
CREATE POLICY "group_members_update"
ON public.group_members
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.groups
    WHERE groups.id = group_members.group_id
      AND public.rbac_check_permission_request(
        public.rbac_perm_org_update_user_roles(),
        groups.org_id,
        NULL::character varying,
        NULL::bigint
      )
  )
);

DROP POLICY IF EXISTS "groups_delete" ON public.groups;
CREATE POLICY "groups_delete"
ON public.groups
FOR DELETE
TO authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_org_update_user_roles(),
    org_id,
    NULL::character varying,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "groups_insert" ON public.groups;
CREATE POLICY "groups_insert"
ON public.groups
FOR INSERT
TO authenticated
WITH CHECK (
  public.rbac_check_permission_request(
    public.rbac_perm_org_update_user_roles(),
    org_id,
    NULL::character varying,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "groups_update" ON public.groups;
CREATE POLICY "groups_update"
ON public.groups
FOR UPDATE
TO authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_org_update_user_roles(),
    org_id,
    NULL::character varying,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow select for auth, api keys (read+)" ON public.manifest;
CREATE POLICY "Allow RBAC manifest select"
ON public.manifest
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.app_versions av
    WHERE av.id = manifest.app_version_id
      AND public.rbac_check_permission_request(
        public.rbac_perm_app_read_bundles(),
        av.owner_org,
        av.app_id,
        NULL::bigint
      )
  )
);

DROP POLICY IF EXISTS "Allow member and owner to select" ON public.org_users;
CREATE POLICY "Allow member and owner to select"
ON public.org_users
FOR SELECT
TO anon, authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.rbac_check_permission_request(
    public.rbac_perm_org_read_members(),
    org_id,
    NULL::character varying,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow org admin to insert" ON public.org_users;
CREATE POLICY "Allow org admin to insert"
ON public.org_users
FOR INSERT
TO anon, authenticated
WITH CHECK (
  public.rbac_check_permission_request(
    public.rbac_perm_org_update_user_roles(),
    org_id,
    NULL::character varying,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow org admin to update" ON public.org_users;
CREATE POLICY "Allow org admin to update"
ON public.org_users
FOR UPDATE
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_org_update_user_roles(),
    org_id,
    NULL::character varying,
    NULL::bigint
  )
)
WITH CHECK (
  public.rbac_check_permission_request(
    public.rbac_perm_org_update_user_roles(),
    org_id,
    NULL::character varying,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow to self delete" ON public.org_users;
CREATE POLICY "Allow to self delete"
ON public.org_users
FOR DELETE
TO anon, authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.rbac_check_permission_request(
    public.rbac_perm_org_update_user_roles(),
    org_id,
    NULL::character varying,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow org delete for super_admin" ON public.orgs;
CREATE POLICY "Allow org delete for super_admin"
ON public.orgs
FOR DELETE
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_org_delete(),
    id,
    NULL::character varying,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow select for auth, api keys (read+)" ON public.orgs;
CREATE POLICY "Allow RBAC orgs select"
ON public.orgs
FOR SELECT
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_org_read(),
    id,
    NULL::character varying,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "role_bindings_delete" ON public.role_bindings;
CREATE POLICY "role_bindings_delete"
ON public.role_bindings
FOR DELETE
TO authenticated
USING (
  (
    scope_type = public.rbac_scope_org()
    AND public.rbac_check_permission_request(
      public.rbac_perm_org_update_user_roles(),
      org_id,
      NULL::character varying,
      NULL::bigint
    )
  )
  OR (
    scope_type = public.rbac_scope_app()
    AND EXISTS (
      SELECT 1
      FROM public.apps
      WHERE apps.id = role_bindings.app_id
        AND public.rbac_check_permission_request(
          public.rbac_perm_app_update_user_roles(),
          apps.owner_org,
          apps.app_id,
          NULL::bigint
        )
    )
  )
  OR (
    scope_type = public.rbac_scope_channel()
    AND EXISTS (
      SELECT 1
      FROM public.channels
      WHERE channels.rbac_id = role_bindings.channel_id
        AND public.rbac_check_permission_request(
          public.rbac_perm_app_update_user_roles(),
          channels.owner_org,
          channels.app_id,
          channels.id
        )
    )
  )
);

CREATE OR REPLACE FUNCTION public.mark_org_delete_cascade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing text := current_setting('capgo.org_delete_cascade_org_ids', true);
BEGIN
  PERFORM set_config(
    'capgo.org_delete_cascade_org_ids',
    concat_ws(',', NULLIF(v_existing, ''), OLD.id::text),
    true
  );

  RETURN OLD;
END;
$$;

ALTER FUNCTION public.mark_org_delete_cascade() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.mark_org_delete_cascade() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_org_delete_cascade() TO service_role;

DROP TRIGGER IF EXISTS mark_org_delete_cascade ON public.orgs;
CREATE TRIGGER mark_org_delete_cascade
BEFORE DELETE ON public.orgs
FOR EACH ROW
EXECUTE FUNCTION public.mark_org_delete_cascade();

CREATE OR REPLACE FUNCTION public.prevent_last_super_admin_binding_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_remaining_count integer;
  v_delete_cascade_org_ids text[] := string_to_array(current_setting('capgo.org_delete_cascade_org_ids', true), ',');
BEGIN
  IF OLD.scope_type != public.rbac_scope_org() THEN
    RETURN OLD;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.roles r
    WHERE r.id = OLD.role_id
      AND r.name = public.rbac_role_org_super_admin()
  ) THEN
    RETURN OLD;
  END IF;

  IF OLD.org_id::text = ANY(COALESCE(v_delete_cascade_org_ids, '{}'::text[])) THEN
    RETURN OLD;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(OLD.org_id::text));

  SELECT COUNT(*) INTO v_remaining_count
  FROM public.role_bindings rb
  INNER JOIN public.roles r ON rb.role_id = r.id
  WHERE rb.scope_type = public.rbac_scope_org()
    AND rb.org_id = OLD.org_id
    AND rb.principal_type = public.rbac_principal_user()
    AND r.name = public.rbac_role_org_super_admin()
    AND rb.id != OLD.id
    AND (rb.expires_at IS NULL OR rb.expires_at > now());

  IF v_remaining_count < 1 THEN
    RAISE EXCEPTION 'CANNOT_DELETE_LAST_SUPER_ADMIN_BINDING'
      USING HINT = 'At least one super_admin binding must remain in the org';
  END IF;

  RETURN OLD;
END;
$$;

ALTER FUNCTION public.prevent_last_super_admin_binding_delete() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prevent_last_super_admin_binding_delete() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.prevent_last_super_admin_binding_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_remaining_count integer;
  v_org_exists boolean;
BEGIN
  IF OLD.role_id IS NOT DISTINCT FROM NEW.role_id THEN
    RETURN NEW;
  END IF;

  IF OLD.scope_type != public.rbac_scope_org() THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.roles r
    WHERE r.id = OLD.role_id
      AND r.name = public.rbac_role_org_super_admin()
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.roles r
    WHERE r.id = NEW.role_id
      AND r.name = public.rbac_role_org_super_admin()
  ) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.orgs
    WHERE id = OLD.org_id
  ) INTO v_org_exists;

  IF NOT v_org_exists THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(OLD.org_id::text));

  SELECT COUNT(*) INTO v_remaining_count
  FROM public.role_bindings rb
  INNER JOIN public.roles r ON rb.role_id = r.id
  WHERE rb.scope_type = public.rbac_scope_org()
    AND rb.org_id = OLD.org_id
    AND rb.principal_type = public.rbac_principal_user()
    AND r.name = public.rbac_role_org_super_admin()
    AND rb.id != OLD.id
    AND (rb.expires_at IS NULL OR rb.expires_at > now());

  IF v_remaining_count < 1 THEN
    RAISE EXCEPTION 'CANNOT_DEMOTE_LAST_SUPER_ADMIN_BINDING'
      USING HINT = 'At least one super_admin binding must remain in the org';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.prevent_last_super_admin_binding_update() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prevent_last_super_admin_binding_update() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prevent_last_super_admin_binding_update() TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_last_super_admin_binding_delete() TO service_role;

DROP POLICY IF EXISTS "role_bindings_insert" ON public.role_bindings;
CREATE POLICY "role_bindings_insert"
ON public.role_bindings
FOR INSERT
TO authenticated
WITH CHECK (
  (
    scope_type = public.rbac_scope_org()
    AND public.rbac_check_permission_request(
      public.rbac_perm_org_update_user_roles(),
      org_id,
      NULL::character varying,
      NULL::bigint
    )
  )
  OR (
    scope_type = public.rbac_scope_app()
    AND EXISTS (
      SELECT 1
      FROM public.apps
      WHERE apps.id = role_bindings.app_id
        AND public.rbac_check_permission_request(
          public.rbac_perm_app_update_user_roles(),
          apps.owner_org,
          apps.app_id,
          NULL::bigint
        )
    )
  )
  OR (
    scope_type = public.rbac_scope_channel()
    AND EXISTS (
      SELECT 1
      FROM public.channels
      WHERE channels.rbac_id = role_bindings.channel_id
        AND public.rbac_check_permission_request(
          public.rbac_perm_app_update_user_roles(),
          channels.owner_org,
          channels.app_id,
          channels.id
        )
    )
  )
);

DROP POLICY IF EXISTS "role_bindings_update" ON public.role_bindings;
CREATE POLICY "role_bindings_update"
ON public.role_bindings
FOR UPDATE
TO authenticated
USING (
  (
    scope_type = public.rbac_scope_org()
    AND public.rbac_check_permission_request(
      public.rbac_perm_org_update_user_roles(),
      org_id,
      NULL::character varying,
      NULL::bigint
    )
  )
  OR (
    scope_type = public.rbac_scope_app()
    AND EXISTS (
      SELECT 1
      FROM public.apps
      WHERE apps.id = role_bindings.app_id
        AND public.rbac_check_permission_request(
          public.rbac_perm_app_update_user_roles(),
          apps.owner_org,
          apps.app_id,
          NULL::bigint
        )
    )
  )
  OR (
    scope_type = public.rbac_scope_channel()
    AND EXISTS (
      SELECT 1
      FROM public.channels
      WHERE channels.rbac_id = role_bindings.channel_id
        AND public.rbac_check_permission_request(
          public.rbac_perm_app_update_user_roles(),
          channels.owner_org,
          channels.app_id,
          channels.id
        )
    )
  )
);

CREATE OR REPLACE FUNCTION public.prevent_role_binding_priority_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
  v_principal_type text;
  v_principal_id uuid;
  v_target_role_priority integer;
  v_caller_max_priority integer := 0;
BEGIN
  IF public.is_internal_request_role(public.current_request_role()) THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1
    AND current_setting('capgo.org_creation_bootstrap_org_id', true) = NEW.org_id::text
    AND NEW.principal_type = public.rbac_principal_user()
    AND NEW.scope_type = public.rbac_scope_org()
    AND NEW.principal_id = NEW.granted_by
    AND NEW.app_id IS NULL
    AND NEW.bundle_id IS NULL
    AND NEW.channel_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.orgs
      WHERE orgs.id = NEW.org_id
        AND orgs.created_by = NEW.principal_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.roles
      WHERE roles.id = NEW.role_id
        AND roles.scope_type = public.rbac_scope_org()
        AND roles.name = public.rbac_role_org_super_admin()
    )
  THEN
    RETURN NEW;
  END IF;

  v_actor_id := public.request_actor_user_id();

  SELECT roles.priority_rank
  INTO v_target_role_priority
  FROM public.roles
  WHERE roles.id = NEW.role_id
    AND roles.scope_type = NEW.scope_type
    AND roles.is_assignable IS TRUE
  LIMIT 1;

  IF v_target_role_priority IS NULL THEN
    PERFORM public.pg_log(
      'deny: ROLE_BINDING_ROLE_UNKNOWN',
      pg_catalog.jsonb_build_object('org_id', NEW.org_id, 'uid', v_actor_id, 'role_id', NEW.role_id)
    );
    RAISE EXCEPTION 'Admins cannot assign this role!';
  END IF;

  v_api_key_text := public.get_apikey_header();
  IF v_api_key_text IS NOT NULL THEN
    SELECT *
    INTO v_api_key
    FROM public.find_apikey_by_value(v_api_key_text)
    LIMIT 1;

    IF v_api_key.id IS NULL OR public.is_apikey_expired(v_api_key.expires_at) THEN
      PERFORM public.pg_log(
        'deny: ROLE_BINDING_INVALID_API_KEY',
        pg_catalog.jsonb_build_object('org_id', NEW.org_id, 'uid', v_actor_id)
      );
      RAISE EXCEPTION 'Admins cannot elevate privileges!';
    END IF;

    v_principal_type := public.rbac_principal_apikey();
    v_principal_id := v_api_key.rbac_id;
  ELSE
    v_principal_type := public.rbac_principal_user();
    v_principal_id := v_actor_id;
  END IF;

  IF v_principal_id IS NULL THEN
    PERFORM public.pg_log(
      'deny: ROLE_BINDING_MISSING_PRINCIPAL',
      pg_catalog.jsonb_build_object('org_id', NEW.org_id, 'uid', v_actor_id)
    );
    RAISE EXCEPTION 'Admins cannot elevate privileges!';
  END IF;

  IF v_principal_type = public.rbac_principal_apikey() THEN
    SELECT COALESCE(pg_catalog.MAX(roles.priority_rank), 0)
    INTO v_caller_max_priority
    FROM public.role_bindings
    JOIN public.roles
      ON roles.id = role_bindings.role_id
      AND roles.scope_type = role_bindings.scope_type
    WHERE role_bindings.principal_type = public.rbac_principal_apikey()
      AND role_bindings.principal_id = v_principal_id
      AND role_bindings.org_id = NEW.org_id
      AND (
        role_bindings.expires_at IS NULL
        OR role_bindings.expires_at > pg_catalog.now()
      );
  ELSE
    SELECT COALESCE(pg_catalog.MAX(roles.priority_rank), 0)
    INTO v_caller_max_priority
    FROM (
      SELECT role_bindings.role_id, role_bindings.scope_type
      FROM public.role_bindings
      WHERE role_bindings.principal_type = public.rbac_principal_user()
        AND role_bindings.principal_id = v_principal_id
        AND role_bindings.org_id = NEW.org_id
        AND (
          role_bindings.expires_at IS NULL
          OR role_bindings.expires_at > pg_catalog.now()
        )

      UNION ALL

      SELECT role_bindings.role_id, role_bindings.scope_type
      FROM public.group_members
      JOIN public.groups
        ON groups.id = group_members.group_id
        AND groups.org_id = NEW.org_id
      JOIN public.role_bindings
        ON role_bindings.principal_type = public.rbac_principal_group()
        AND role_bindings.principal_id = group_members.group_id
        AND role_bindings.org_id = groups.org_id
      WHERE group_members.user_id = v_principal_id
        AND (
          role_bindings.expires_at IS NULL
          OR role_bindings.expires_at > pg_catalog.now()
        )
    ) active_caller_bindings
    JOIN public.roles
      ON roles.id = active_caller_bindings.role_id
      AND roles.scope_type = active_caller_bindings.scope_type;
  END IF;

  IF v_caller_max_priority < v_target_role_priority THEN
    PERFORM public.pg_log(
      'deny: ROLE_BINDING_PRIORITY_ESCALATION',
      pg_catalog.jsonb_build_object(
        'org_id',
        NEW.org_id,
        'uid',
        v_actor_id,
        'role_id',
        NEW.role_id,
        'caller_max_priority',
        v_caller_max_priority,
        'target_role_priority',
        v_target_role_priority
      )
    );
    RAISE EXCEPTION 'Admins cannot elevate privileges!';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_role_binding_priority_escalation() IS
  'Prevents direct role_bindings writes from assigning a role above the caller principal rank.';

ALTER FUNCTION public.prevent_role_binding_priority_escalation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prevent_role_binding_priority_escalation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prevent_role_binding_priority_escalation() TO service_role;

DROP TRIGGER IF EXISTS prevent_role_binding_priority_escalation ON public.role_bindings;
CREATE TRIGGER prevent_role_binding_priority_escalation
BEFORE INSERT OR UPDATE OF role_id, principal_type, principal_id, scope_type, org_id, app_id, bundle_id, channel_id
ON public.role_bindings
FOR EACH ROW
EXECUTE FUNCTION public.prevent_role_binding_priority_escalation();

DROP POLICY IF EXISTS "allow_org_admins_insert_sso_providers" ON public.sso_providers;
CREATE POLICY "allow_org_admins_insert_sso_providers"
ON public.sso_providers
FOR INSERT
TO anon, authenticated
WITH CHECK (
  public.rbac_check_permission_request(
    public.rbac_perm_org_update_settings(),
    org_id,
    NULL::character varying,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "allow_org_admins_select_sso_providers" ON public.sso_providers;
CREATE POLICY "allow_org_admins_select_sso_providers"
ON public.sso_providers
FOR SELECT
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_org_update_settings(),
    org_id,
    NULL::character varying,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "allow_org_admins_update_sso_providers" ON public.sso_providers;
CREATE POLICY "allow_org_admins_update_sso_providers"
ON public.sso_providers
FOR UPDATE
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_org_update_settings(),
    org_id,
    NULL::character varying,
    NULL::bigint
  )
)
WITH CHECK (
  public.rbac_check_permission_request(
    public.rbac_perm_org_update_settings(),
    org_id,
    NULL::character varying,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "allow_org_super_admins_delete_sso_providers" ON public.sso_providers;
CREATE POLICY "allow_org_super_admins_delete_sso_providers"
ON public.sso_providers
FOR DELETE
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_org_update_user_roles(),
    org_id,
    NULL::character varying,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow read for auth (read+)" ON public.stats;
CREATE POLICY "Allow RBAC stats select"
ON public.stats
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = stats.app_id
      AND public.rbac_check_permission_request(
        public.rbac_perm_app_read(),
        apps.owner_org,
        apps.app_id,
        NULL::bigint
      )
  )
);

DROP POLICY IF EXISTS "Allow org member to select stripe_info" ON public.stripe_info;
CREATE POLICY "Allow org member to select stripe_info"
ON public.stripe_info
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orgs
    WHERE orgs.customer_id = stripe_info.customer_id
      AND public.rbac_check_permission_request(
        public.rbac_perm_org_read_billing(),
        orgs.id,
        NULL::character varying,
        NULL::bigint
      )
  )
);

DROP POLICY IF EXISTS "Allow admin to delete webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to insert webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to select webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to update webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to insert webhook_deliveries" ON public.webhook_deliveries;
DROP POLICY IF EXISTS "Allow admin to update webhook_deliveries" ON public.webhook_deliveries;
DROP POLICY IF EXISTS "Allow org members to select webhook_deliveries" ON public.webhook_deliveries;

DROP POLICY IF EXISTS "Allow user or apikey to delete they own folder in apps" ON storage.objects;
CREATE POLICY "Allow user or apikey to delete they own folder in apps"
ON storage.objects
FOR DELETE
TO anon, authenticated
USING (
  bucket_id = 'apps'
  AND (
    (
      (SELECT auth.uid())::text = (storage.foldername(name))[1]
      AND EXISTS (
        SELECT 1
        FROM public.apps
        WHERE apps.app_id = ((storage.foldername(name))[2])::character varying
          AND public.rbac_check_permission_request(
            public.rbac_perm_bundle_delete(),
            apps.owner_org,
            apps.app_id,
            NULL::bigint
          )
      )
    )
    OR capgo_private.matches_app_storage_rbac_owner(
      (storage.foldername(name))[1],
      ((storage.foldername(name))[2])::character varying,
      public.rbac_perm_bundle_delete()
    )
  )
);

DROP POLICY IF EXISTS "Allow user or apikey to insert they own folder in apps" ON storage.objects;
CREATE POLICY "Allow user or apikey to insert they own folder in apps"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'apps'
  AND (
    (
      (SELECT auth.uid())::text = (storage.foldername(name))[1]
      AND EXISTS (
        SELECT 1
        FROM public.apps
        WHERE apps.app_id = ((storage.foldername(name))[2])::character varying
          AND public.rbac_check_permission_request(
            public.rbac_perm_app_upload_bundle(),
            apps.owner_org,
            apps.app_id,
            NULL::bigint
          )
      )
    )
    OR capgo_private.matches_app_storage_rbac_owner(
      (storage.foldername(name))[1],
      ((storage.foldername(name))[2])::character varying,
      public.rbac_perm_app_upload_bundle()
    )
  )
);

DROP POLICY IF EXISTS "Allow user or apikey to read they own folder in apps" ON storage.objects;
CREATE POLICY "Allow user or apikey to read they own folder in apps"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'apps'
  AND (
    (
      (SELECT auth.uid())::text = (storage.foldername(name))[1]
      AND EXISTS (
        SELECT 1
        FROM public.apps
        WHERE apps.app_id = ((storage.foldername(name))[2])::character varying
          AND public.rbac_check_permission_request(
            public.rbac_perm_app_read_bundles(),
            apps.owner_org,
            apps.app_id,
            NULL::bigint
          )
      )
    )
    OR capgo_private.matches_app_storage_rbac_owner(
      (storage.foldername(name))[1],
      ((storage.foldername(name))[2])::character varying,
      public.rbac_perm_app_read_bundles()
    )
  )
);

DROP POLICY IF EXISTS "Allow user or apikey to update they own folder in apps" ON storage.objects;
CREATE POLICY "Allow user or apikey to update they own folder in apps"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (
  bucket_id = 'apps'
  AND (
    (
      (SELECT auth.uid())::text = (storage.foldername(name))[1]
      AND EXISTS (
        SELECT 1
        FROM public.apps
        WHERE apps.app_id = ((storage.foldername(name))[2])::character varying
          AND public.rbac_check_permission_request(
            public.rbac_perm_app_upload_bundle(),
            apps.owner_org,
            apps.app_id,
            NULL::bigint
          )
      )
    )
    OR capgo_private.matches_app_storage_rbac_owner(
      (storage.foldername(name))[1],
      ((storage.foldername(name))[2])::character varying,
      public.rbac_perm_app_upload_bundle()
    )
  )
)
WITH CHECK (
  bucket_id = 'apps'
  AND (
    (
      (SELECT auth.uid())::text = (storage.foldername(name))[1]
      AND EXISTS (
        SELECT 1
        FROM public.apps
        WHERE apps.app_id = ((storage.foldername(name))[2])::character varying
          AND public.rbac_check_permission_request(
            public.rbac_perm_app_upload_bundle(),
            apps.owner_org,
            apps.app_id,
            NULL::bigint
          )
      )
    )
    OR capgo_private.matches_app_storage_rbac_owner(
      (storage.foldername(name))[1],
      ((storage.foldername(name))[2])::character varying,
      public.rbac_perm_app_upload_bundle()
    )
  )
);

DROP POLICY IF EXISTS "Allow user or apikey to read they own folder in images" ON storage.objects;
CREATE POLICY "Allow user or apikey to read they own folder in images"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'images'
  AND (
    (storage.foldername(name))[1] = 'public'
    OR (
      (storage.foldername(name))[1] = 'org'
      AND (storage.foldername(name))[3] IS NOT NULL
      AND (storage.foldername(name))[3] <> 'logo'
      AND public.rbac_check_permission_request(
        public.rbac_perm_app_read(),
        ((storage.foldername(name))[2])::uuid,
        ((storage.foldername(name))[3])::character varying,
        NULL::bigint
      )
    )
    OR (
      (storage.foldername(name))[1] = 'org'
      AND (storage.foldername(name))[3] = 'logo'
      AND public.rbac_check_permission_request(
        public.rbac_perm_org_read(),
        ((storage.foldername(name))[2])::uuid,
        NULL::character varying,
        NULL::bigint
      )
    )
    OR (
      (storage.foldername(name))[1] <> 'org'
      AND (storage.foldername(name))[1] <> 'public'
      AND (
        (SELECT auth.uid())::text = (storage.foldername(name))[1]
        OR EXISTS (
          SELECT 1
          FROM public.org_users ou
          WHERE ou.user_id::text = (storage.foldername(name))[1]
            AND public.rbac_check_permission_request(
              public.rbac_perm_org_read_members(),
              ou.org_id,
              NULL::character varying,
              NULL::bigint
            )
        )
      )
    )
  )
);

DROP POLICY IF EXISTS "Allow user or apikey to delete they own folder in images" ON storage.objects;
CREATE POLICY "Allow user or apikey to delete they own folder in images"
ON storage.objects
FOR DELETE
TO anon, authenticated
USING (
  bucket_id = 'images'
  AND (
    (
      (storage.foldername(name))[1] = 'org'
      AND (storage.foldername(name))[3] IS NOT NULL
      AND (storage.foldername(name))[3] <> 'logo'
      AND public.rbac_check_permission_request(
        public.rbac_perm_app_update_settings(),
        ((storage.foldername(name))[2])::uuid,
        ((storage.foldername(name))[3])::character varying,
        NULL::bigint
      )
    )
    OR (
      (storage.foldername(name))[1] = 'org'
      AND (storage.foldername(name))[3] = 'logo'
      AND public.rbac_check_permission_request(
        public.rbac_perm_org_update_settings(),
        ((storage.foldername(name))[2])::uuid,
        NULL::character varying,
        NULL::bigint
      )
    )
    OR (
      (SELECT auth.uid())::text = (storage.foldername(name))[1]
    )
  )
);

DROP POLICY IF EXISTS "Allow user or apikey to update they own folder in images" ON storage.objects;
CREATE POLICY "Allow user or apikey to update they own folder in images"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (
  bucket_id = 'images'
  AND (
    (
      (storage.foldername(name))[1] = 'org'
      AND (storage.foldername(name))[3] IS NOT NULL
      AND (storage.foldername(name))[3] <> 'logo'
      AND public.rbac_check_permission_request(
        public.rbac_perm_app_update_settings(),
        ((storage.foldername(name))[2])::uuid,
        ((storage.foldername(name))[3])::character varying,
        NULL::bigint
      )
    )
    OR (
      (storage.foldername(name))[1] = 'org'
      AND (storage.foldername(name))[3] = 'logo'
      AND public.rbac_check_permission_request(
        public.rbac_perm_org_update_settings(),
        ((storage.foldername(name))[2])::uuid,
        NULL::character varying,
        NULL::bigint
      )
    )
    OR (
      (SELECT auth.uid())::text = (storage.foldername(name))[1]
    )
  )
)
WITH CHECK (
  bucket_id = 'images'
  AND (
    (
      (storage.foldername(name))[1] = 'org'
      AND (storage.foldername(name))[3] IS NOT NULL
      AND (storage.foldername(name))[3] <> 'logo'
      AND public.rbac_check_permission_request(
        public.rbac_perm_app_update_settings(),
        ((storage.foldername(name))[2])::uuid,
        ((storage.foldername(name))[3])::character varying,
        NULL::bigint
      )
    )
    OR (
      (storage.foldername(name))[1] = 'org'
      AND (storage.foldername(name))[3] = 'logo'
      AND public.rbac_check_permission_request(
        public.rbac_perm_org_update_settings(),
        ((storage.foldername(name))[2])::uuid,
        NULL::character varying,
        NULL::bigint
      )
    )
    OR (
      (SELECT auth.uid())::text = (storage.foldername(name))[1]
    )
  )
);

CREATE OR REPLACE FUNCTION public.request_actor_user_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_uid uuid;
  v_apikey text;
  v_api_key public.apikeys%ROWTYPE;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NOT NULL THEN
    RETURN v_auth_uid;
  END IF;

  v_apikey := public.get_apikey_header();
  IF v_apikey IS NULL OR v_apikey = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_api_key
  FROM public.find_apikey_by_value(v_apikey)
  LIMIT 1;

  IF v_api_key.id IS NULL OR public.is_apikey_expired(v_api_key.expires_at) THEN
    RETURN NULL;
  END IF;

  RETURN v_api_key.user_id;
END;
$$;

ALTER FUNCTION public.request_actor_user_id() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.request_actor_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_actor_user_id() TO anon;
GRANT EXECUTE ON FUNCTION public.request_actor_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_actor_user_id() TO service_role;

CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_record jsonb;
  v_new_record jsonb;
  v_changed_fields text[];
  v_org_id uuid;
  v_record_id text;
  v_user_id uuid;
  v_key text;
  v_org_exists boolean;
  v_stats_refresh_fields constant text[] := ARRAY['stats_refresh_requested_at', 'stats_updated_at', 'updated_at'];
BEGIN
  IF TG_TABLE_NAME = 'orgs' AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  v_user_id := public.request_actor_user_id();
  IF v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_old_record := to_jsonb(OLD);
    v_new_record := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_record := NULL;
    v_new_record := to_jsonb(NEW);
  ELSE
    v_old_record := to_jsonb(OLD);
    v_new_record := to_jsonb(NEW);

    FOR v_key IN SELECT jsonb_object_keys(v_new_record)
    LOOP
      IF v_old_record->v_key IS DISTINCT FROM v_new_record->v_key THEN
        v_changed_fields := array_append(v_changed_fields, v_key);
      END IF;
    END LOOP;

    IF TG_TABLE_NAME = ANY(ARRAY['apps', 'orgs'])
      AND v_changed_fields && ARRAY['stats_refresh_requested_at', 'stats_updated_at']
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(v_changed_fields) AS changed_field(field_name)
        WHERE changed_field.field_name <> ALL(v_stats_refresh_fields)
      )
    THEN
      RETURN NEW;
    END IF;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'orgs' THEN
      v_org_id := COALESCE(NEW.id, OLD.id);
      v_record_id := COALESCE(NEW.id, OLD.id)::text;
    WHEN 'apps' THEN
      v_org_id := COALESCE(NEW.owner_org, OLD.owner_org);
      v_record_id := COALESCE(NEW.app_id, OLD.app_id)::text;
    WHEN 'channels' THEN
      v_org_id := COALESCE(NEW.owner_org, OLD.owner_org);
      v_record_id := COALESCE(NEW.id, OLD.id)::text;
    WHEN 'app_versions' THEN
      v_org_id := COALESCE(NEW.owner_org, OLD.owner_org);
      v_record_id := COALESCE(NEW.id, OLD.id)::text;
    WHEN 'org_users' THEN
      v_org_id := COALESCE(NEW.org_id, OLD.org_id);
      v_record_id := COALESCE(NEW.id, OLD.id)::text;
    ELSE
      v_org_id := NULL;
      v_record_id := NULL;
  END CASE;

  IF v_org_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.orgs WHERE id = v_org_id) INTO v_org_exists;

    IF v_org_exists THEN
      INSERT INTO public.audit_logs (
        table_name, record_id, operation, user_id, org_id,
        old_record, new_record, changed_fields
      ) VALUES (
        TG_TABLE_NAME, v_record_id, TG_OP, v_user_id, v_org_id,
        v_old_record, v_new_record, v_changed_fields
      );
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION public.audit_log_trigger() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.audit_log_trigger() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_log_trigger() TO service_role;

CREATE OR REPLACE FUNCTION public.record_deployment_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.version IS DISTINCT FROM NEW.version AND NEW.version IS NOT NULL THEN
    INSERT INTO public.deploy_history (
      channel_id,
      app_id,
      version_id,
      owner_org,
      created_by
    )
    VALUES (
      NEW.id,
      NEW.app_id,
      NEW.version,
      NEW.owner_org,
      COALESCE(public.request_actor_user_id(), NEW.created_by)
    );
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.record_deployment_history() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_deployment_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_deployment_history() TO service_role;

CREATE OR REPLACE FUNCTION public.get_user_org_ids()
RETURNS TABLE(org_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_apikey text;
  v_api_key public.apikeys%ROWTYPE;
  v_user_id uuid;
BEGIN
  v_apikey := public.get_apikey_header();

  IF v_apikey IS NOT NULL THEN
    SELECT * INTO v_api_key
    FROM public.find_apikey_by_value(v_apikey)
    LIMIT 1;

    IF v_api_key.id IS NULL THEN
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;

    IF public.is_apikey_expired(v_api_key.expires_at) THEN
      RAISE EXCEPTION 'API key has expired';
    END IF;

    RETURN QUERY
    SELECT DISTINCT scoped.org_uuid
    FROM (
      SELECT rb.org_id AS org_uuid
      FROM public.role_bindings rb
      WHERE rb.principal_type = public.rbac_principal_apikey()
        AND rb.principal_id = v_api_key.rbac_id
        AND rb.org_id IS NOT NULL
        AND (rb.expires_at IS NULL OR rb.expires_at > now())
      UNION
      SELECT apps.owner_org AS org_uuid
      FROM public.role_bindings rb
      JOIN public.apps ON apps.id = rb.app_id
      WHERE rb.principal_type = public.rbac_principal_apikey()
        AND rb.principal_id = v_api_key.rbac_id
        AND rb.app_id IS NOT NULL
        AND (rb.expires_at IS NULL OR rb.expires_at > now())
      UNION
      SELECT apps.owner_org AS org_uuid
      FROM public.role_bindings rb
      JOIN public.channels ch ON ch.rbac_id = rb.channel_id
      JOIN public.apps ON apps.app_id = ch.app_id
      WHERE rb.principal_type = public.rbac_principal_apikey()
        AND rb.principal_id = v_api_key.rbac_id
        AND rb.channel_id IS NOT NULL
        AND (rb.expires_at IS NULL OR rb.expires_at > now())
    ) scoped
    WHERE scoped.org_uuid IS NOT NULL;
    RETURN;
  END IF;

  v_user_id := auth.uid();
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
    SELECT apps.owner_org AS org_uuid
    FROM public.role_bindings rb
    JOIN public.channels ch ON ch.rbac_id = rb.channel_id
    JOIN public.apps ON apps.app_id = ch.app_id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = v_user_id
      AND rb.channel_id IS NOT NULL
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
    SELECT apps.owner_org AS org_uuid
    FROM public.role_bindings rb
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    JOIN public.apps ON apps.id = rb.app_id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = v_user_id
      AND rb.app_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    SELECT apps.owner_org AS org_uuid
    FROM public.role_bindings rb
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    JOIN public.channels ch ON ch.rbac_id = rb.channel_id
    JOIN public.apps ON apps.app_id = ch.app_id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = v_user_id
      AND rb.channel_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    SELECT ou.org_id AS org_uuid
    FROM public.org_users ou
    WHERE ou.user_id = v_user_id
      AND ou.is_invite IS TRUE
      AND ou.org_id IS NOT NULL
  ) scoped
  WHERE scoped.org_uuid IS NOT NULL;
END;
$$;

ALTER FUNCTION public.get_user_org_ids() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_user_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_org_ids() TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_org_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_org_ids() TO service_role;

DROP FUNCTION IF EXISTS public.get_orgs_v6();
DROP FUNCTION IF EXISTS public.get_orgs_v6(uuid);
DROP FUNCTION IF EXISTS public.get_orgs_v7();
DROP FUNCTION IF EXISTS public.get_orgs_v7(uuid);

CREATE OR REPLACE FUNCTION public.get_orgs_v7()
RETURNS TABLE(gid uuid, created_by uuid, created_at timestamp with time zone, logo text, website text, name text, role character varying, is_invite boolean, paying boolean, trial_left integer, can_use_more boolean, is_canceled boolean, app_count bigint, subscription_start timestamp with time zone, subscription_end timestamp with time zone, management_email text, is_yearly boolean, stats_updated_at timestamp without time zone, stats_refresh_requested_at timestamp without time zone, next_stats_update_at timestamp with time zone, credit_available numeric, credit_total numeric, credit_next_expiration timestamp with time zone, enforcing_2fa boolean, "2fa_has_access" boolean, enforce_hashed_api_keys boolean, password_policy_config jsonb, password_has_access boolean, require_apikey_expiration boolean, max_apikey_expiration_days integer, enforce_encrypted_bundles boolean, required_encryption_key character varying)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_apikey text;
BEGIN
  v_apikey := public.get_apikey_header();
  v_user_id := public.request_actor_user_id();

  IF v_apikey IS NOT NULL AND v_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid API key provided';
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

ALTER FUNCTION public.get_orgs_v7() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_orgs_v7() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_orgs_v7() TO anon;
GRANT EXECUTE ON FUNCTION public.get_orgs_v7() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orgs_v7() TO service_role;

CREATE OR REPLACE FUNCTION public.check_org_members_2fa_enabled(org_id uuid)
RETURNS TABLE(user_id uuid, "2fa_enabled" boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE public.orgs.id = check_org_members_2fa_enabled.org_id) THEN
    RAISE EXCEPTION 'Organization does not exist';
  END IF;

  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_update_settings(),
      check_org_members_2fa_enabled.org_id,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  RETURN QUERY
  SELECT
    ou.user_id,
    COALESCE(public.has_2fa_enabled(ou.user_id), false) AS "2fa_enabled"
  FROM public.org_users ou
  WHERE ou.org_id = check_org_members_2fa_enabled.org_id;
END;
$$;

ALTER FUNCTION public.check_org_members_2fa_enabled(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.check_org_members_2fa_enabled(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_org_members_2fa_enabled(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.check_org_members_2fa_enabled(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_org_members_2fa_enabled(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.check_org_members_password_policy(org_id uuid)
RETURNS TABLE(user_id uuid, email text, first_name text, last_name text, password_policy_compliant boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_update_settings(),
      check_org_members_password_policy.org_id,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.orgs
    WHERE public.orgs.id = check_org_members_password_policy.org_id
  ) THEN
    RAISE EXCEPTION 'Organization does not exist';
  END IF;

  RETURN QUERY
  SELECT
    ou.user_id,
    au.email::text,
    u.first_name::text,
    u.last_name::text,
    public.user_meets_password_policy(ou.user_id, check_org_members_password_policy.org_id) AS password_policy_compliant
  FROM public.org_users ou
  JOIN auth.users au ON au.id = ou.user_id
  LEFT JOIN public.users u ON u.id = ou.user_id
  WHERE ou.org_id = check_org_members_password_policy.org_id;
END;
$$;

ALTER FUNCTION public.check_org_members_password_policy(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.check_org_members_password_policy(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_org_members_password_policy(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.check_org_members_password_policy(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_org_members_password_policy(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.reject_access_due_to_2fa_for_org(org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_org_enforcing_2fa boolean;
BEGIN
  IF NOT public.rbac_check_permission_request(
    public.rbac_perm_org_read(),
    reject_access_due_to_2fa_for_org.org_id,
    NULL::character varying,
    NULL::bigint
  ) THEN
    RETURN true;
  END IF;

  v_user_id := public.request_actor_user_id();
  IF v_user_id IS NULL THEN
    RETURN true;
  END IF;

  SELECT enforcing_2fa INTO v_org_enforcing_2fa
  FROM public.orgs
  WHERE public.orgs.id = reject_access_due_to_2fa_for_org.org_id;

  RETURN COALESCE(v_org_enforcing_2fa, false) AND NOT public.has_2fa_enabled(v_user_id);
END;
$$;

ALTER FUNCTION public.reject_access_due_to_2fa_for_org(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reject_access_due_to_2fa_for_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_access_due_to_2fa_for_org(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.reject_access_due_to_2fa_for_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_access_due_to_2fa_for_org(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.reject_access_due_to_2fa_for_app(app_id character varying)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_org uuid;
  v_user_id uuid;
  v_org_enforcing_2fa boolean;
BEGIN
  SELECT owner_org INTO v_owner_org
  FROM public.apps
  WHERE public.apps.app_id = reject_access_due_to_2fa_for_app.app_id;

  IF v_owner_org IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.rbac_check_permission_request(
    public.rbac_perm_app_read(),
    v_owner_org,
    reject_access_due_to_2fa_for_app.app_id,
    NULL::bigint
  ) THEN
    RETURN false;
  END IF;

  v_user_id := public.request_actor_user_id();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT enforcing_2fa INTO v_org_enforcing_2fa
  FROM public.orgs
  WHERE public.orgs.id = v_owner_org;

  RETURN COALESCE(v_org_enforcing_2fa, false) AND NOT public.has_2fa_enabled(v_user_id);
END;
$$;

ALTER FUNCTION public.reject_access_due_to_2fa_for_app(character varying) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reject_access_due_to_2fa_for_app(character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_access_due_to_2fa_for_app(character varying) TO anon;
GRANT EXECUTE ON FUNCTION public.reject_access_due_to_2fa_for_app(character varying) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_access_due_to_2fa_for_app(character varying) TO service_role;

CREATE OR REPLACE FUNCTION public.get_app_metrics(org_id uuid)
RETURNS TABLE(app_id character varying, date date, mau bigint, storage bigint, bandwidth bigint, build_time_unit bigint, get bigint, fail bigint, install bigint, uninstall bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cycle_start timestamptz;
  cycle_end timestamptz;
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_read(),
      get_app_metrics.org_id,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE orgs.id = get_app_metrics.org_id) THEN
    RETURN;
  END IF;

  SELECT subscription_anchor_start, subscription_anchor_end
  INTO cycle_start, cycle_end
  FROM public.get_cycle_info_org(org_id);

  RETURN QUERY
  SELECT *
  FROM public.get_app_metrics(org_id, cycle_start::date, cycle_end::date);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_app_metrics(org_id uuid, start_date date, end_date date)
RETURNS TABLE(app_id character varying, date date, mau bigint, storage bigint, bandwidth bigint, build_time_unit bigint, get bigint, fail bigint, install bigint, uninstall bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cache_entry public.app_metrics_cache%ROWTYPE;
  org_stats_updated_at timestamp without time zone;
  v_cache_ttl CONSTANT interval := INTERVAL '5 minutes';
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_read(),
      get_app_metrics.org_id,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE orgs.id = get_app_metrics.org_id) THEN
    RETURN;
  END IF;

  SELECT o.stats_updated_at
  INTO org_stats_updated_at
  FROM public.orgs o
  WHERE o.id = get_app_metrics.org_id
  LIMIT 1;

  SELECT *
  INTO cache_entry
  FROM public.app_metrics_cache
  WHERE app_metrics_cache.org_id = get_app_metrics.org_id;

  IF cache_entry.id IS NULL
    OR cache_entry.start_date IS DISTINCT FROM get_app_metrics.start_date
    OR cache_entry.end_date IS DISTINCT FROM get_app_metrics.end_date
    OR cache_entry.cached_at IS NULL
    OR cache_entry.cached_at < (pg_catalog.now() - v_cache_ttl)
    OR (
      org_stats_updated_at IS NOT NULL
      AND pg_catalog.timezone('UTC', cache_entry.cached_at) < org_stats_updated_at
    ) THEN
    cache_entry := public.seed_get_app_metrics_caches(
      get_app_metrics.org_id,
      get_app_metrics.start_date,
      get_app_metrics.end_date
    );
  END IF;

  IF cache_entry.response IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    metrics.app_id,
    metrics.date,
    metrics.mau,
    metrics.storage,
    metrics.bandwidth,
    metrics.build_time_unit,
    metrics.get,
    metrics.fail,
    metrics.install,
    metrics.uninstall
  FROM pg_catalog.jsonb_to_recordset(cache_entry.response) AS metrics(
    app_id character varying,
    date date,
    mau bigint,
    storage bigint,
    bandwidth bigint,
    build_time_unit bigint,
    get bigint,
    fail bigint,
    install bigint,
    uninstall bigint
  )
  ORDER BY metrics.app_id, metrics.date;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_app_metrics(p_org_id uuid, p_app_id character varying, p_start_date date, p_end_date date)
RETURNS TABLE(app_id character varying, date date, mau bigint, storage bigint, bandwidth bigint, build_time_unit bigint, get bigint, fail bigint, install bigint, uninstall bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cache_entry public.app_metrics_cache%ROWTYPE;
  org_stats_updated_at timestamp without time zone;
  v_cache_ttl CONSTANT interval := INTERVAL '5 minutes';
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_app_read(),
      get_app_metrics.p_org_id,
      get_app_metrics.p_app_id,
      NULL::bigint
    )
  THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = get_app_metrics.p_app_id
      AND apps.owner_org = get_app_metrics.p_org_id
  ) THEN
    RETURN;
  END IF;

  SELECT o.stats_updated_at
  INTO org_stats_updated_at
  FROM public.orgs o
  WHERE o.id = get_app_metrics.p_org_id
  LIMIT 1;

  SELECT *
  INTO cache_entry
  FROM public.app_metrics_cache
  WHERE app_metrics_cache.org_id = get_app_metrics.p_org_id;

  IF cache_entry.id IS NULL
    OR cache_entry.start_date IS DISTINCT FROM get_app_metrics.p_start_date
    OR cache_entry.end_date IS DISTINCT FROM get_app_metrics.p_end_date
    OR cache_entry.cached_at IS NULL
    OR cache_entry.cached_at < (pg_catalog.now() - v_cache_ttl)
    OR (
      org_stats_updated_at IS NOT NULL
      AND pg_catalog.timezone('UTC', cache_entry.cached_at) < org_stats_updated_at
    ) THEN
    cache_entry := public.seed_get_app_metrics_caches(
      get_app_metrics.p_org_id,
      get_app_metrics.p_start_date,
      get_app_metrics.p_end_date
    );
  END IF;

  IF cache_entry.response IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    metrics.app_id,
    metrics.date,
    metrics.mau,
    metrics.storage,
    metrics.bandwidth,
    metrics.build_time_unit,
    metrics.get,
    metrics.fail,
    metrics.install,
    metrics.uninstall
  FROM pg_catalog.jsonb_to_recordset(cache_entry.response) AS metrics(
    app_id character varying,
    date date,
    mau bigint,
    storage bigint,
    bandwidth bigint,
    build_time_unit bigint,
    get bigint,
    fail bigint,
    install bigint,
    uninstall bigint
  )
  WHERE metrics.app_id = get_app_metrics.p_app_id
  ORDER BY metrics.date;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_global_metrics(org_id uuid)
RETURNS TABLE(date date, mau bigint, storage bigint, bandwidth bigint, get bigint, fail bigint, install bigint, uninstall bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cycle_start timestamptz;
  cycle_end timestamptz;
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_read(),
      get_global_metrics.org_id,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE orgs.id = get_global_metrics.org_id) THEN
    RETURN;
  END IF;

  SELECT subscription_anchor_start, subscription_anchor_end
  INTO cycle_start, cycle_end
  FROM public.get_cycle_info_org(org_id);

  RETURN QUERY
  SELECT *
  FROM public.get_global_metrics(org_id, cycle_start::date, cycle_end::date);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_global_metrics(org_id uuid, start_date date, end_date date)
RETURNS TABLE(date date, mau bigint, storage bigint, bandwidth bigint, get bigint, fail bigint, install bigint, uninstall bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_read(),
      get_global_metrics.org_id,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    metrics.date,
    SUM(metrics.mau)::bigint AS mau,
    SUM(metrics.storage)::bigint AS storage,
    SUM(metrics.bandwidth)::bigint AS bandwidth,
    SUM(metrics.get)::bigint AS get,
    SUM(metrics.fail)::bigint AS fail,
    SUM(metrics.install)::bigint AS install,
    SUM(metrics.uninstall)::bigint AS uninstall
  FROM public.get_app_metrics(org_id, start_date, end_date) AS metrics
  GROUP BY metrics.date
  ORDER BY metrics.date;
END;
$$;

ALTER FUNCTION public.get_app_metrics(uuid) OWNER TO postgres;
ALTER FUNCTION public.get_app_metrics(uuid, date, date) OWNER TO postgres;
ALTER FUNCTION public.get_app_metrics(uuid, character varying, date, date) OWNER TO postgres;
ALTER FUNCTION public.get_global_metrics(uuid) OWNER TO postgres;
ALTER FUNCTION public.get_global_metrics(uuid, date, date) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.is_paying_and_good_plan_org_action(orgid uuid, actions public.action_type[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.is_paying_and_good_plan_org_action(orgid, actions, NULL::character varying);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_paying_and_good_plan_org_action(orgid uuid, actions public.action_type[], appid character varying)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  org_customer_id text;
  result boolean;
  has_credits boolean;
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role()) THEN
    IF appid IS NOT NULL THEN
      IF NOT public.rbac_check_permission_request(public.rbac_perm_app_read(), orgid, appid, NULL::bigint) THEN
        RETURN false;
      END IF;
    ELSIF NOT public.rbac_check_permission_request(public.rbac_perm_org_read(), orgid, NULL::character varying, NULL::bigint) THEN
      RETURN false;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.usage_credit_balances ucb
    WHERE ucb.org_id = orgid
      AND COALESCE(ucb.available_credits, 0) > 0
  ) INTO has_credits;

  IF has_credits THEN
    RETURN true;
  END IF;

  SELECT o.customer_id INTO org_customer_id
  FROM public.orgs o
  WHERE o.id = orgid;

  SELECT (si.trial_at > now()) OR (si.status = 'succeeded' AND NOT (
      (si.mau_exceeded AND 'mau' = ANY(actions))
      OR (si.storage_exceeded AND 'storage' = ANY(actions))
      OR (si.bandwidth_exceeded AND 'bandwidth' = ANY(actions))
      OR (si.build_time_exceeded AND 'build_time' = ANY(actions))
    ))
  INTO result
  FROM public.stripe_info si
  WHERE si.customer_id = org_customer_id
  LIMIT 1;

  RETURN COALESCE(result, false);
END;
$$;

ALTER FUNCTION public.is_paying_and_good_plan_org_action(uuid, public.action_type[]) OWNER TO postgres;
ALTER FUNCTION public.is_paying_and_good_plan_org_action(uuid, public.action_type[], character varying) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.is_canceled_org(orgid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(public.rbac_perm_org_read(), orgid, NULL::character varying, NULL::bigint)
  THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.stripe_info
    WHERE customer_id = (SELECT customer_id FROM public.orgs WHERE id = orgid)
      AND status = 'canceled'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_good_plan_v5_org(orgid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product_id text;
  v_start_date date;
  v_end_date date;
  v_plan_name text;
  total_metrics record;
  v_anchor_day interval;
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(public.rbac_perm_org_read(), orgid, NULL::character varying, NULL::bigint)
  THEN
    RETURN false;
  END IF;

  SELECT
    si.product_id,
    COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::interval)
  INTO v_product_id, v_anchor_day
  FROM public.orgs o
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  WHERE o.id = orgid;

  IF v_anchor_day > now() - date_trunc('MONTH', now()) THEN
    v_start_date := (date_trunc('MONTH', now() - interval '1 MONTH') + v_anchor_day)::date;
  ELSE
    v_start_date := (date_trunc('MONTH', now()) + v_anchor_day)::date;
  END IF;
  v_end_date := (v_start_date + interval '1 MONTH')::date;

  SELECT p.name INTO v_plan_name
  FROM public.plans p
  WHERE p.stripe_id = v_product_id;

  IF v_plan_name = 'Enterprise' THEN
    RETURN true;
  END IF;

  SELECT * INTO total_metrics
  FROM public.get_total_metrics(orgid, v_start_date, v_end_date);

  RETURN EXISTS (
    SELECT 1
    FROM public.plans p
    WHERE p.name = v_plan_name
      AND p.mau >= total_metrics.mau
      AND p.bandwidth >= total_metrics.bandwidth
      AND p.storage >= total_metrics.storage
      AND p.build_time_unit >= COALESCE(total_metrics.build_time_unit, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_onboarded_org(orgid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(public.rbac_perm_org_read(), orgid, NULL::character varying, NULL::bigint)
  THEN
    RETURN false;
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.apps WHERE owner_org = orgid)
    AND EXISTS (SELECT 1 FROM public.app_versions WHERE owner_org = orgid);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_onboarding_needed_org(orgid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(public.rbac_perm_org_read(), orgid, NULL::character varying, NULL::bigint)
  THEN
    RETURN false;
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.orgs WHERE id = orgid)
    AND NOT public.is_onboarded_org(orgid)
    AND public.is_trial_org(orgid) = 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_org_yearly(orgid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  is_yearly boolean;
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(public.rbac_perm_org_read_billing(), orgid, NULL::character varying, NULL::bigint)
  THEN
    RETURN false;
  END IF;

  SELECT
    CASE
      WHEN si.price_id = p.price_y_id THEN true
      ELSE false
    END INTO is_yearly
  FROM public.orgs o
  JOIN public.stripe_info si ON o.customer_id = si.customer_id
  JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid
  LIMIT 1;

  RETURN COALESCE(is_yearly, false);
END;
$$;

ALTER FUNCTION public.is_canceled_org(uuid) OWNER TO postgres;
ALTER FUNCTION public.is_good_plan_v5_org(uuid) OWNER TO postgres;
ALTER FUNCTION public.is_onboarded_org(uuid) OWNER TO postgres;
ALTER FUNCTION public.is_onboarding_needed_org(uuid) OWNER TO postgres;
ALTER FUNCTION public.is_org_yearly(uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.check_org_user_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
  v_principal_type text;
  v_principal_id uuid;
  v_target_role_priority integer;
  v_caller_max_priority integer := 0;
BEGIN
  IF public.is_internal_request_role(public.current_request_role()) THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1
    AND current_setting('capgo.org_creation_bootstrap_org_id', true) = NEW.org_id::text
    AND EXISTS (
      SELECT 1
      FROM public.orgs
      WHERE orgs.id = NEW.org_id
        AND orgs.created_by = NEW.user_id
    )
  THEN
    RETURN NEW;
  END IF;

  v_actor_id := public.request_actor_user_id();

  IF TG_OP = 'UPDATE'
    AND (
      NEW.org_id IS DISTINCT FROM OLD.org_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
    )
  THEN
    PERFORM public.pg_log(
      'deny: ORG_USER_MEMBERSHIP_MOVE',
      pg_catalog.jsonb_build_object('org_id', NEW.org_id, 'uid', v_actor_id)
    );
    RAISE EXCEPTION 'Admins cannot move org memberships!';
  END IF;

  SELECT roles.priority_rank
  INTO v_target_role_priority
  FROM public.roles
  WHERE roles.name = NEW.rbac_role_name
    AND roles.scope_type = public.rbac_scope_org()
    AND roles.is_assignable IS TRUE
  LIMIT 1;

  IF v_target_role_priority IS NULL THEN
    PERFORM public.pg_log(
      'deny: ORG_USER_ROLE_UNKNOWN',
      pg_catalog.jsonb_build_object('org_id', NEW.org_id, 'uid', v_actor_id, 'role', NEW.rbac_role_name)
    );
    RAISE EXCEPTION 'Admins cannot assign this role!';
  END IF;

  IF v_actor_id IS NULL
    OR NOT public.rbac_check_permission_request(
      public.rbac_perm_org_update_user_roles(),
      NEW.org_id,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    PERFORM public.pg_log(
      'deny: ORG_USER_ROLE_UPDATE',
      pg_catalog.jsonb_build_object('org_id', NEW.org_id, 'uid', v_actor_id)
    );
    RAISE EXCEPTION 'Admins cannot elevate privileges!';
  END IF;

  v_api_key_text := public.get_apikey_header();
  IF v_api_key_text IS NOT NULL THEN
    SELECT *
    INTO v_api_key
    FROM public.find_apikey_by_value(v_api_key_text)
    LIMIT 1;

    IF v_api_key.id IS NULL OR public.is_apikey_expired(v_api_key.expires_at) THEN
      PERFORM public.pg_log(
        'deny: ORG_USER_ROLE_INVALID_API_KEY',
        pg_catalog.jsonb_build_object('org_id', NEW.org_id, 'uid', v_actor_id)
      );
      RAISE EXCEPTION 'Admins cannot elevate privileges!';
    END IF;

    v_principal_type := public.rbac_principal_apikey();
    v_principal_id := v_api_key.rbac_id;
  ELSE
    v_principal_type := public.rbac_principal_user();
    v_principal_id := v_actor_id;
  END IF;

  IF v_principal_id IS NULL THEN
    PERFORM public.pg_log(
      'deny: ORG_USER_ROLE_MISSING_PRINCIPAL',
      pg_catalog.jsonb_build_object('org_id', NEW.org_id, 'uid', v_actor_id)
    );
    RAISE EXCEPTION 'Admins cannot elevate privileges!';
  END IF;

  IF v_principal_type = public.rbac_principal_apikey() THEN
    SELECT COALESCE(pg_catalog.MAX(roles.priority_rank), 0)
    INTO v_caller_max_priority
    FROM public.role_bindings
    JOIN public.roles
      ON roles.id = role_bindings.role_id
      AND roles.scope_type = role_bindings.scope_type
    WHERE role_bindings.principal_type = public.rbac_principal_apikey()
      AND role_bindings.principal_id = v_principal_id
      AND role_bindings.org_id = NEW.org_id
      AND (
        role_bindings.expires_at IS NULL
        OR role_bindings.expires_at > pg_catalog.now()
      );
  ELSE
    SELECT COALESCE(pg_catalog.MAX(roles.priority_rank), 0)
    INTO v_caller_max_priority
    FROM (
      SELECT role_bindings.role_id, role_bindings.scope_type
      FROM public.role_bindings
      WHERE role_bindings.principal_type = public.rbac_principal_user()
        AND role_bindings.principal_id = v_principal_id
        AND role_bindings.org_id = NEW.org_id
        AND (
          role_bindings.expires_at IS NULL
          OR role_bindings.expires_at > pg_catalog.now()
        )

      UNION ALL

      SELECT role_bindings.role_id, role_bindings.scope_type
      FROM public.group_members
      JOIN public.groups
        ON groups.id = group_members.group_id
        AND groups.org_id = NEW.org_id
      JOIN public.role_bindings
        ON role_bindings.principal_type = public.rbac_principal_group()
        AND role_bindings.principal_id = group_members.group_id
        AND role_bindings.org_id = groups.org_id
      WHERE group_members.user_id = v_principal_id
        AND (
          role_bindings.expires_at IS NULL
          OR role_bindings.expires_at > pg_catalog.now()
        )
    ) active_caller_bindings
    JOIN public.roles
      ON roles.id = active_caller_bindings.role_id
      AND roles.scope_type = active_caller_bindings.scope_type;
  END IF;

  IF v_caller_max_priority < v_target_role_priority THEN
    PERFORM public.pg_log(
      'deny: ORG_USER_ROLE_PRIORITY_ESCALATION',
      pg_catalog.jsonb_build_object(
        'org_id',
        NEW.org_id,
        'uid',
        v_actor_id,
        'role',
        NEW.rbac_role_name,
        'caller_max_priority',
        v_caller_max_priority,
        'target_role_priority',
        v_target_role_priority
      )
    );
    RAISE EXCEPTION 'Admins cannot elevate privileges!';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.check_org_user_privileges() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.check_org_user_privileges() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_org_user_privileges() TO service_role;

CREATE OR REPLACE FUNCTION public.get_orgs_v6()
RETURNS TABLE(gid uuid, created_by uuid, logo text, name text, role character varying, paying boolean, trial_left integer, can_use_more boolean, is_canceled boolean, app_count bigint, subscription_start timestamp with time zone, subscription_end timestamp with time zone, management_email text, is_yearly boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_apikey text;
BEGIN
  v_apikey := public.get_apikey_header();
  v_user_id := public.request_actor_user_id();

  IF v_apikey IS NOT NULL AND v_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid API key provided';
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No authentication provided - API key or valid session required';
  END IF;

  RETURN QUERY
  SELECT
    orgs.gid,
    orgs.created_by,
    orgs.logo,
    orgs.name,
    orgs.role,
    orgs.paying,
    orgs.trial_left,
    orgs.can_use_more,
    orgs.is_canceled,
    orgs.app_count,
    orgs.subscription_start,
    orgs.subscription_end,
    orgs.management_email,
    orgs.is_yearly
  FROM public.get_orgs_v7(v_user_id) orgs
  JOIN public.get_user_org_ids() allowed_orgs ON allowed_orgs.org_id = orgs.gid;
END;
$$;

ALTER FUNCTION public.get_orgs_v6() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_orgs_v6() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_orgs_v6() TO anon;
GRANT EXECUTE ON FUNCTION public.get_orgs_v6() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orgs_v6() TO service_role;

CREATE OR REPLACE FUNCTION public.get_current_plan_max_org(orgid uuid)
RETURNS TABLE(mau bigint, bandwidth bigint, storage bigint, build_time_unit bigint, native_build_concurrency integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_read_billing(),
      get_current_plan_max_org.orgid,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.mau,
    p.bandwidth,
    p.storage,
    p.build_time_unit,
    p.native_build_concurrency
  FROM public.orgs o
  JOIN public.stripe_info si ON o.customer_id = si.customer_id
  JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_plan_name_org(orgid uuid)
RETURNS character varying
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_read_billing(),
      get_current_plan_name_org.orgid,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RETURN NULL;
  END IF;

  RETURN (
    SELECT p.name
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    JOIN public.plans p ON si.product_id = p.stripe_id
    WHERE o.id = orgid
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cycle_info_org(orgid uuid)
RETURNS TABLE(subscription_anchor_start timestamp with time zone, subscription_anchor_end timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  customer_id_var text;
  stripe_info_row public.stripe_info%ROWTYPE;
  anchor_day interval;
  start_date timestamptz;
  end_date timestamptz;
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_read(),
      get_cycle_info_org.orgid,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RETURN;
  END IF;

  SELECT customer_id
  INTO customer_id_var
  FROM public.orgs
  WHERE id = orgid;

  SELECT *
  INTO stripe_info_row
  FROM public.stripe_info
  WHERE customer_id = customer_id_var;

  anchor_day := COALESCE(
    stripe_info_row.subscription_anchor_start - date_trunc('MONTH', stripe_info_row.subscription_anchor_start),
    '0 DAYS'::interval
  );

  IF anchor_day > now() - date_trunc('MONTH', now()) THEN
    start_date := date_trunc('MONTH', now() - interval '1 MONTH') + anchor_day;
  ELSE
    start_date := date_trunc('MONTH', now()) + anchor_day;
  END IF;

  end_date := start_date + interval '1 MONTH';

  RETURN QUERY
  SELECT start_date, end_date;
END;
$$;

ALTER FUNCTION public.get_current_plan_max_org(uuid) OWNER TO postgres;
ALTER FUNCTION public.get_current_plan_name_org(uuid) OWNER TO postgres;
ALTER FUNCTION public.get_cycle_info_org(uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.get_plan_usage_percent_detailed(orgid uuid)
RETURNS TABLE(total_percent double precision, mau_percent double precision, bandwidth_percent double precision, storage_percent double precision, build_time_percent double precision)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start_date date;
  v_end_date date;
  v_plan_mau bigint;
  v_plan_bandwidth bigint;
  v_plan_storage bigint;
  v_plan_build_time bigint;
  v_anchor_day interval;
  total_stats record;
  percent_mau double precision;
  percent_bandwidth double precision;
  percent_storage double precision;
  percent_build_time double precision;
  v_tx_read_only boolean := current_setting('transaction_read_only') = 'on';
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_read_billing(),
      get_plan_usage_percent_detailed.orgid,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::interval),
    p.mau,
    p.bandwidth,
    p.storage,
    p.build_time_unit
  INTO v_anchor_day, v_plan_mau, v_plan_bandwidth, v_plan_storage, v_plan_build_time
  FROM public.orgs o
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  LEFT JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid;

  IF v_anchor_day > now() - date_trunc('MONTH', now()) THEN
    v_start_date := (date_trunc('MONTH', now() - interval '1 MONTH') + v_anchor_day)::date;
  ELSE
    v_start_date := (date_trunc('MONTH', now()) + v_anchor_day)::date;
  END IF;
  v_end_date := (v_start_date + interval '1 MONTH')::date;

  IF v_tx_read_only THEN
    SELECT * INTO total_stats
    FROM public.calculate_org_metrics_cache_entry(orgid, v_start_date, v_end_date);
  ELSE
    SELECT * INTO total_stats
    FROM public.get_total_metrics(orgid, v_start_date, v_end_date);
  END IF;

  percent_mau := public.convert_number_to_percent(total_stats.mau, v_plan_mau);
  percent_bandwidth := public.convert_number_to_percent(total_stats.bandwidth, v_plan_bandwidth);
  percent_storage := public.convert_number_to_percent(total_stats.storage, v_plan_storage);
  percent_build_time := public.convert_number_to_percent(total_stats.build_time_unit, v_plan_build_time);

  RETURN QUERY
  SELECT
    GREATEST(percent_mau, percent_bandwidth, percent_storage, percent_build_time),
    percent_mau,
    percent_bandwidth,
    percent_storage,
    percent_build_time;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_plan_usage_percent_detailed(orgid uuid, cycle_start date, cycle_end date)
RETURNS TABLE(total_percent double precision, mau_percent double precision, bandwidth_percent double precision, storage_percent double precision, build_time_percent double precision)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan_mau bigint;
  v_plan_bandwidth bigint;
  v_plan_storage bigint;
  v_plan_build_time bigint;
  total_stats record;
  percent_mau double precision;
  percent_bandwidth double precision;
  percent_storage double precision;
  percent_build_time double precision;
  v_tx_read_only boolean := current_setting('transaction_read_only') = 'on';
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_read_billing(),
      get_plan_usage_percent_detailed.orgid,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RETURN;
  END IF;

  SELECT p.mau, p.bandwidth, p.storage, p.build_time_unit
  INTO v_plan_mau, v_plan_bandwidth, v_plan_storage, v_plan_build_time
  FROM public.orgs o
  JOIN public.stripe_info si ON o.customer_id = si.customer_id
  JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid;

  IF v_tx_read_only THEN
    SELECT * INTO total_stats
    FROM public.calculate_org_metrics_cache_entry(orgid, cycle_start, cycle_end);
  ELSE
    SELECT * INTO total_stats
    FROM public.get_total_metrics(orgid, cycle_start, cycle_end);
  END IF;

  percent_mau := public.convert_number_to_percent(total_stats.mau, v_plan_mau);
  percent_bandwidth := public.convert_number_to_percent(total_stats.bandwidth, v_plan_bandwidth);
  percent_storage := public.convert_number_to_percent(total_stats.storage, v_plan_storage);
  percent_build_time := public.convert_number_to_percent(total_stats.build_time_unit, v_plan_build_time);

  RETURN QUERY
  SELECT
    GREATEST(percent_mau, percent_bandwidth, percent_storage, percent_build_time),
    percent_mau,
    percent_bandwidth,
    percent_storage,
    percent_build_time;
END;
$$;

ALTER FUNCTION public.get_plan_usage_percent_detailed(uuid) OWNER TO postgres;
ALTER FUNCTION public.get_plan_usage_percent_detailed(uuid, date, date) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.count_non_compliant_bundles(org_id uuid, required_key text DEFAULT NULL::text)
RETURNS TABLE(non_encrypted_count bigint, wrong_key_count bigint, total_non_compliant bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  non_encrypted bigint := 0;
  wrong_key bigint := 0;
  caller_user_id uuid;
BEGIN
  caller_user_id := public.request_actor_user_id();

  IF caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required';
  END IF;

  IF NOT public.rbac_check_permission_request(
    public.rbac_perm_org_delete(),
    count_non_compliant_bundles.org_id,
    NULL::character varying,
    NULL::bigint
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only super_admin can access this function';
  END IF;

  SELECT COUNT(*) INTO non_encrypted
  FROM public.app_versions av
  INNER JOIN public.apps a ON a.app_id = av.app_id
  WHERE a.owner_org = count_non_compliant_bundles.org_id
    AND av.deleted = false
    AND (av.session_key IS NULL OR av.session_key = '');

  IF required_key IS NOT NULL AND required_key <> '' THEN
    SELECT COUNT(*) INTO wrong_key
    FROM public.app_versions av
    INNER JOIN public.apps a ON a.app_id = av.app_id
    WHERE a.owner_org = count_non_compliant_bundles.org_id
      AND av.deleted = false
      AND av.session_key IS NOT NULL
      AND av.session_key <> ''
      AND (
        av.key_id IS NULL
        OR av.key_id = ''
        OR NOT (av.key_id = LEFT(required_key, 20) OR LEFT(av.key_id, LENGTH(required_key)) = required_key)
      );
  END IF;

  RETURN QUERY SELECT non_encrypted, wrong_key, (non_encrypted + wrong_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_non_compliant_bundles(org_id uuid, required_key text DEFAULT NULL::text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count bigint := 0;
  bundle_ids bigint[];
  caller_user_id uuid;
BEGIN
  caller_user_id := public.request_actor_user_id();

  IF caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required';
  END IF;

  IF NOT public.rbac_check_permission_request(
    public.rbac_perm_org_delete(),
    delete_non_compliant_bundles.org_id,
    NULL::character varying,
    NULL::bigint
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only super_admin can access this function';
  END IF;

  IF required_key IS NULL OR required_key = '' THEN
    SELECT ARRAY_AGG(av.id) INTO bundle_ids
    FROM public.app_versions av
    INNER JOIN public.apps a ON a.app_id = av.app_id
    WHERE a.owner_org = delete_non_compliant_bundles.org_id
      AND av.deleted = false
      AND (av.session_key IS NULL OR av.session_key = '');
  ELSE
    SELECT ARRAY_AGG(av.id) INTO bundle_ids
    FROM public.app_versions av
    INNER JOIN public.apps a ON a.app_id = av.app_id
    WHERE a.owner_org = delete_non_compliant_bundles.org_id
      AND av.deleted = false
      AND (
        (av.session_key IS NULL OR av.session_key = '')
        OR (
          av.session_key IS NOT NULL
          AND av.session_key <> ''
          AND (
            av.key_id IS NULL
            OR av.key_id = ''
            OR NOT (av.key_id = LEFT(required_key, 20) OR LEFT(av.key_id, LENGTH(required_key)) = required_key)
          )
        )
      );
  END IF;

  IF bundle_ids IS NOT NULL AND array_length(bundle_ids, 1) > 0 THEN
    UPDATE public.app_versions
    SET deleted = true
    WHERE id = ANY(bundle_ids);

    deleted_count := array_length(bundle_ids, 1);

    PERFORM public.pg_log('action: DELETED_NON_COMPLIANT_BUNDLES',
      jsonb_build_object(
        'org_id', org_id,
        'required_key', required_key,
        'deleted_count', deleted_count,
        'bundle_ids', bundle_ids,
        'caller_user_id', caller_user_id
      ));
  END IF;

  RETURN deleted_count;
END;
$$;

ALTER FUNCTION public.count_non_compliant_bundles(uuid, text) OWNER TO postgres;
ALTER FUNCTION public.delete_non_compliant_bundles(uuid, text) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.exist_app_v2(appid character varying)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_org uuid;
BEGIN
  SELECT apps.owner_org INTO v_owner_org
  FROM public.apps
  WHERE apps.app_id = exist_app_v2.appid
  LIMIT 1;

  IF v_owner_org IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_internal_request_role(public.current_request_role()) THEN
    RETURN true;
  END IF;

  RETURN public.rbac_check_permission_request(
    public.rbac_perm_app_read(),
    v_owner_org,
    exist_app_v2.appid,
    NULL::bigint
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.noupdate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  val record;
  is_different boolean;
BEGIN
  IF current_setting('capgo.allow_owner_org_transfer', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.rbac_check_permission_request(
    public.rbac_perm_app_update_settings(),
    OLD.owner_org,
    OLD.app_id,
    NULL::bigint
  ) THEN
    RETURN NEW;
  END IF;

  FOR val IN SELECT * FROM json_each_text(row_to_json(NEW))
  LOOP
    EXECUTE format('SELECT ($1."%s" is distinct from $2."%s")', val.key, val.key) USING NEW, OLD
    INTO is_different;

    IF is_different AND val.key <> 'version' AND val.key <> 'updated_at' THEN
      RAISE EXCEPTION 'not allowed %', val.key;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.exist_app_v2(character varying) OWNER TO postgres;
ALTER FUNCTION public.noupdate() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.noupdate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.noupdate() TO service_role;

CREATE OR REPLACE FUNCTION public.request_app_chart_refresh(app_id character varying)
RETURNS TABLE(requested_at timestamp without time zone, queued_app_ids character varying[], queued_count integer, skipped_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id uuid;
  v_before_requested_at timestamp without time zone;
  v_after_requested_at timestamp without time zone;
  v_request_started_at timestamp without time zone := pg_catalog.timezone('UTC', pg_catalog.clock_timestamp());
  v_queued boolean := false;
BEGIN
  IF request_app_chart_refresh.app_id IS NULL OR request_app_chart_refresh.app_id = '' THEN
    RAISE EXCEPTION 'App ID is required';
  END IF;

  SELECT a.owner_org, a.stats_refresh_requested_at
  INTO v_org_id, v_before_requested_at
  FROM public.apps a
  WHERE a.app_id = request_app_chart_refresh.app_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    IF public.is_internal_request_role(public.current_request_role()) THEN
      RAISE EXCEPTION 'App not found';
    END IF;
    RAISE EXCEPTION 'App access denied';
  END IF;

  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_app_read(),
      v_org_id,
      request_app_chart_refresh.app_id,
      NULL::bigint
    )
  THEN
    RAISE EXCEPTION 'App access denied';
  END IF;

  PERFORM public.queue_cron_stat_app_for_app(request_app_chart_refresh.app_id, v_org_id);

  SELECT a.stats_refresh_requested_at
  INTO v_after_requested_at
  FROM public.apps a
  WHERE a.app_id = request_app_chart_refresh.app_id
  LIMIT 1;

  v_queued := v_after_requested_at IS NOT NULL
    AND v_after_requested_at >= v_request_started_at
    AND (v_before_requested_at IS NULL OR v_after_requested_at IS DISTINCT FROM v_before_requested_at);

  RETURN QUERY
  SELECT
    v_after_requested_at,
    CASE WHEN v_queued THEN ARRAY[request_app_chart_refresh.app_id]::character varying[] ELSE ARRAY[]::character varying[] END,
    CASE WHEN v_queued THEN 1 ELSE 0 END,
    CASE WHEN v_queued THEN 0 ELSE 1 END;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_org_chart_refresh(org_id uuid)
RETURNS TABLE(requested_at timestamp without time zone, queued_app_ids character varying[], queued_count integer, skipped_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_started_at timestamp without time zone := pg_catalog.timezone('UTC', pg_catalog.clock_timestamp());
  v_queued_app_ids character varying[] := ARRAY[]::character varying[];
  v_queued_count integer := 0;
  v_total_count integer := 0;
  v_org_exists boolean := false;
  v_org_requested_at_before timestamp without time zone;
  v_return_requested_at timestamp without time zone;
  v_before_requested_at timestamp without time zone;
  v_after_requested_at timestamp without time zone;
  app_record record;
BEGIN
  IF request_org_chart_refresh.org_id IS NULL THEN
    RAISE EXCEPTION 'Org ID is required';
  END IF;

  SELECT o.stats_refresh_requested_at
  INTO v_org_requested_at_before
  FROM public.orgs o
  WHERE o.id = request_org_chart_refresh.org_id
  LIMIT 1;

  v_org_exists := FOUND;

  IF NOT v_org_exists THEN
    IF public.is_internal_request_role(public.current_request_role()) THEN
      RAISE EXCEPTION 'Organization not found';
    END IF;
    RAISE EXCEPTION 'Organization access denied';
  END IF;

  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_read(),
      request_org_chart_refresh.org_id,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RAISE EXCEPTION 'Organization access denied';
  END IF;

  FOR app_record IN
    SELECT a.app_id, a.stats_refresh_requested_at
    FROM public.apps a
    WHERE a.owner_org = request_org_chart_refresh.org_id
    ORDER BY a.app_id
  LOOP
    v_total_count := v_total_count + 1;
    v_before_requested_at := app_record.stats_refresh_requested_at;

    PERFORM public.queue_cron_stat_app_for_app(app_record.app_id, request_org_chart_refresh.org_id);

    SELECT a.stats_refresh_requested_at
    INTO v_after_requested_at
    FROM public.apps a
    WHERE a.app_id = app_record.app_id
    LIMIT 1;

    IF v_after_requested_at IS NOT NULL
      AND v_after_requested_at >= v_request_started_at
      AND (v_before_requested_at IS NULL OR v_after_requested_at IS DISTINCT FROM v_before_requested_at) THEN
      v_queued_count := v_queued_count + 1;
      v_queued_app_ids := array_append(v_queued_app_ids, app_record.app_id);
    END IF;
  END LOOP;

  IF v_queued_count > 0 THEN
    UPDATE public.orgs
    SET stats_refresh_requested_at = v_request_started_at
    WHERE id = request_org_chart_refresh.org_id;

    v_return_requested_at := v_request_started_at;
  ELSE
    v_return_requested_at := v_org_requested_at_before;
  END IF;

  RETURN QUERY
  SELECT
    v_return_requested_at,
    COALESCE(v_queued_app_ids, ARRAY[]::character varying[]),
    v_queued_count,
    GREATEST(v_total_count - v_queued_count, 0);
END;
$$;

ALTER FUNCTION public.request_app_chart_refresh(character varying) OWNER TO postgres;
ALTER FUNCTION public.request_org_chart_refresh(uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.read_native_version_usage(p_app_id character varying, p_period_start timestamp without time zone, p_period_end timestamp without time zone)
RETURNS TABLE(date date, platform character varying, version_build character varying, devices bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH authorized_app AS (
    SELECT apps.app_id
    FROM public.apps
    WHERE apps.app_id = p_app_id
      AND public.rbac_check_permission_request(
        public.rbac_perm_app_read(),
        apps.owner_org,
        apps.app_id,
        NULL::bigint
      )
  ),
  daily_version_usage AS (
    SELECT
      date_trunc('day', du.timestamp)::date AS usage_date,
      COALESCE(NULLIF(du.platform, ''), NULLIF(d.platform::text, ''), 'unknown')::character varying AS usage_platform,
      COALESCE(NULLIF(du.version_build, ''), 'unknown')::character varying AS usage_version_build,
      du.device_id
    FROM public.device_usage AS du
    INNER JOIN authorized_app AS aa ON aa.app_id = du.app_id
    LEFT JOIN public.devices AS d
      ON d.app_id = du.app_id
      AND d.device_id = du.device_id
    WHERE du.timestamp >= p_period_start
      AND du.timestamp < p_period_end
  )
  SELECT
    usage_date AS date,
    usage_platform AS platform,
    usage_version_build AS version_build,
    COUNT(DISTINCT device_id)::bigint AS devices
  FROM daily_version_usage
  GROUP BY usage_date, usage_platform, usage_version_build
  ORDER BY usage_date, usage_platform, usage_version_build;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_build_time(p_org_id uuid, p_user_id uuid, p_build_id character varying, p_platform character varying, p_build_time_unit bigint, p_app_id character varying)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_build_log_id uuid;
  v_multiplier numeric;
  v_billable_seconds bigint;
  v_caller_user_id uuid;
BEGIN
  IF p_app_id IS NULL OR p_app_id = '' THEN
    RAISE EXCEPTION 'INVALID_APP_ID';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.apps
    WHERE app_id = p_app_id AND owner_org = p_org_id
  ) THEN
    RAISE EXCEPTION 'INVALID_APP_ID';
  END IF;

  IF public.is_internal_request_role(public.current_request_role()) THEN
    v_caller_user_id := p_user_id;
  ELSE
    v_caller_user_id := public.request_actor_user_id();
  END IF;

  IF v_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_app_build_native(),
      p_org_id,
      p_app_id,
      NULL::bigint
    )
  THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  IF p_build_time_unit < 0 THEN
    RAISE EXCEPTION 'Build time cannot be negative';
  END IF;
  IF p_platform NOT IN ('ios', 'android') THEN
    RAISE EXCEPTION 'Invalid platform: %', p_platform;
  END IF;

  v_multiplier := CASE p_platform
    WHEN 'ios' THEN 2
    WHEN 'android' THEN 1
    ELSE 1
  END;

  v_billable_seconds := (p_build_time_unit * v_multiplier)::bigint;

  INSERT INTO public.build_logs (org_id, user_id, build_id, platform, build_time_unit, billable_seconds, app_id)
  VALUES (p_org_id, v_caller_user_id, p_build_id, p_platform, p_build_time_unit, v_billable_seconds, p_app_id)
  ON CONFLICT (build_id, org_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    platform = EXCLUDED.platform,
    build_time_unit = EXCLUDED.build_time_unit,
    billable_seconds = EXCLUDED.billable_seconds,
    app_id = EXCLUDED.app_id
  RETURNING id INTO v_build_log_id;

  RETURN v_build_log_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rescind_invitation(email text, org_id uuid)
RETURNS character varying
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  tmp_user record;
BEGIN
  IF NOT public.rbac_check_permission_request(
    public.rbac_perm_org_invite_user(),
    rescind_invitation.org_id,
    NULL::character varying,
    NULL::bigint
  ) THEN
    RETURN 'NO_RIGHTS';
  END IF;

  PERFORM 1
  FROM public.orgs
  WHERE public.orgs.id = rescind_invitation.org_id;
  IF NOT FOUND THEN
    RETURN 'NO_RIGHTS';
  END IF;

  SELECT * INTO tmp_user
  FROM public.tmp_users
  WHERE public.tmp_users.email = rescind_invitation.email
    AND public.tmp_users.org_id = rescind_invitation.org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'NO_INVITATION';
  END IF;

  IF tmp_user.cancelled_at IS NOT NULL THEN
    RETURN 'ALREADY_CANCELLED';
  END IF;

  UPDATE public.tmp_users
  SET cancelled_at = CURRENT_TIMESTAMP
  WHERE public.tmp_users.id = tmp_user.id;

  RETURN 'OK';
END;
$$;

ALTER FUNCTION public.read_native_version_usage(character varying, timestamp without time zone, timestamp without time zone) OWNER TO postgres;
ALTER FUNCTION public.record_build_time(uuid, uuid, character varying, character varying, bigint, character varying) OWNER TO postgres;
ALTER FUNCTION public.rescind_invitation(text, uuid) OWNER TO postgres;

DROP FUNCTION IF EXISTS public.app_versions_has_app_permission(public.user_min_right, uuid, character varying, uuid, text);
DROP FUNCTION IF EXISTS capgo_private.matches_app_storage_apikey_owner(text, character varying, public.key_mode[]);
DROP FUNCTION IF EXISTS public.check_min_rights(public.user_min_right, uuid, character varying, bigint);
DROP FUNCTION IF EXISTS public.check_min_rights(public.user_min_right, uuid, uuid, character varying, bigint);
DROP FUNCTION IF EXISTS public.check_min_rights_legacy(public.user_min_right, uuid, uuid, character varying, bigint);
DROP FUNCTION IF EXISTS public.check_min_rights_legacy_no_password_policy(public.user_min_right, uuid, uuid, character varying, bigint);
DROP FUNCTION IF EXISTS public.get_identity();
DROP FUNCTION IF EXISTS public.get_identity(public.key_mode[]);
DROP FUNCTION IF EXISTS public.get_identity_apikey_only(public.key_mode[]);
DROP FUNCTION IF EXISTS public.get_identity_for_apikey_creation();
DROP FUNCTION IF EXISTS public.get_identity_org_allowed(public.key_mode[], uuid);
DROP FUNCTION IF EXISTS public.get_identity_org_allowed_apikey_only(public.key_mode[], uuid);
DROP FUNCTION IF EXISTS public.get_identity_org_appid(public.key_mode[], uuid, character varying);
DROP FUNCTION IF EXISTS public.get_org_owner_id(text, text);
DROP FUNCTION IF EXISTS public.has_app_right(character varying, public.user_min_right);
DROP FUNCTION IF EXISTS public.has_app_right_apikey(character varying, public.user_min_right, uuid, text);
DROP FUNCTION IF EXISTS public.has_app_right_userid(character varying, public.user_min_right, uuid);
DROP FUNCTION IF EXISTS public.is_allowed_capgkey(text, public.key_mode[]);
DROP FUNCTION IF EXISTS public.is_allowed_capgkey(text, public.key_mode[], character varying);
DROP FUNCTION IF EXISTS public.invite_user_to_org(character varying, uuid, public.user_min_right);
DROP FUNCTION IF EXISTS public.modify_permissions_tmp(text, uuid, public.user_min_right);
DROP FUNCTION IF EXISTS public.rbac_legacy_right_for_org_role(text);
DROP FUNCTION IF EXISTS public.rbac_legacy_right_for_permission(text);
DROP FUNCTION IF EXISTS public.rbac_legacy_role_hint(public.user_min_right, character varying, bigint);
DROP FUNCTION IF EXISTS public.rbac_org_role_for_legacy_right(public.user_min_right);
DROP FUNCTION IF EXISTS public.rbac_permission_for_legacy(public.user_min_right, text);
DROP FUNCTION IF EXISTS public.request_read_key_modes();
DROP FUNCTION IF EXISTS public.transform_role_to_invite(public.user_min_right);
DROP FUNCTION IF EXISTS public.transform_role_to_non_invite(public.user_min_right);
DROP FUNCTION IF EXISTS public.apikey_permission_for_keymode(public.key_mode[], text);

-- Hard-delete old API-key modes and org membership rights from live state.
-- RBAC role bindings and RBAC role names are the only authorization data left.
ALTER TABLE public.org_users
  ADD COLUMN IF NOT EXISTS is_invite boolean NOT NULL DEFAULT false;

ALTER TABLE public.org_users
  ALTER COLUMN rbac_role_name SET DEFAULT 'org_member';

ALTER TABLE public.tmp_users
  ALTER COLUMN rbac_role_name SET DEFAULT 'org_member';

UPDATE public.org_users
SET is_invite = (user_right::text LIKE 'invite_%')
WHERE user_right IS NOT NULL;

UPDATE public.org_users
SET rbac_role_name = COALESCE(
  rbac_role_name,
  CASE
    WHEN app_id IS NOT NULL AND channel_id IS NOT NULL THEN
      CASE user_right::text
        WHEN 'invite_super_admin' THEN 'channel_admin'
        WHEN 'super_admin' THEN 'channel_admin'
        WHEN 'invite_admin' THEN 'channel_admin'
        WHEN 'admin' THEN 'channel_admin'
        WHEN 'invite_write' THEN 'channel_developer'
        WHEN 'write' THEN 'channel_developer'
        WHEN 'invite_upload' THEN 'channel_uploader'
        WHEN 'upload' THEN 'channel_uploader'
        ELSE 'channel_reader'
      END
    WHEN app_id IS NOT NULL THEN
      CASE user_right::text
        WHEN 'invite_super_admin' THEN 'app_admin'
        WHEN 'super_admin' THEN 'app_admin'
        WHEN 'invite_admin' THEN 'app_admin'
        WHEN 'admin' THEN 'app_admin'
        WHEN 'invite_write' THEN 'app_developer'
        WHEN 'write' THEN 'app_developer'
        WHEN 'invite_upload' THEN 'app_uploader'
        WHEN 'upload' THEN 'app_uploader'
        ELSE 'app_reader'
      END
    ELSE
      CASE user_right::text
        WHEN 'invite_super_admin' THEN 'org_super_admin'
        WHEN 'super_admin' THEN 'org_super_admin'
        WHEN 'invite_admin' THEN 'org_admin'
        WHEN 'admin' THEN 'org_admin'
        ELSE 'org_member'
      END
  END
)
WHERE rbac_role_name IS NULL;

UPDATE public.tmp_users
SET rbac_role_name = COALESCE(
  rbac_role_name,
  CASE role::text
    WHEN 'invite_super_admin' THEN 'org_super_admin'
    WHEN 'super_admin' THEN 'org_super_admin'
    WHEN 'invite_admin' THEN 'org_admin'
    WHEN 'admin' THEN 'org_admin'
    ELSE 'org_member'
  END
)
WHERE rbac_role_name IS NULL;

ALTER TABLE public.tmp_users
  ALTER COLUMN rbac_role_name SET NOT NULL;

DROP FUNCTION IF EXISTS public.get_invite_by_magic_lookup(text);

CREATE OR REPLACE FUNCTION public.get_invite_by_magic_lookup(lookup text)
RETURNS TABLE(org_name text, org_logo text, role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.name AS org_name,
    o.logo AS org_logo,
    tmp.rbac_role_name AS role
  FROM public.tmp_users tmp
  JOIN public.orgs o ON tmp.org_id = o.id
  WHERE tmp.invite_magic_string = get_invite_by_magic_lookup.lookup
    AND tmp.cancelled_at IS NULL
    AND GREATEST(tmp.updated_at, tmp.created_at) > (CURRENT_TIMESTAMP - INTERVAL '7 days');
END;
$$;

ALTER FUNCTION public.get_invite_by_magic_lookup(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_invite_by_magic_lookup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invite_by_magic_lookup(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_invite_by_magic_lookup(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invite_by_magic_lookup(text) TO service_role;

DO $$
DECLARE
  org_row record;
BEGIN
  FOR org_row IN SELECT id, created_by FROM public.orgs LOOP
    PERFORM public.rbac_migrate_org_users_to_bindings(org_row.id, org_row.created_by);
  END LOOP;
EXCEPTION
  WHEN undefined_function THEN
    NULL;
END;
$$;

DROP FUNCTION IF EXISTS public.get_org_members(uuid);
DROP FUNCTION IF EXISTS public.get_org_members(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_org_members(user_id uuid, guild_id uuid)
RETURNS TABLE(aid bigint, uid uuid, email character varying, image_url character varying, role text, is_tmp boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role()) THEN
    v_user_id := public.request_actor_user_id();

    IF v_user_id IS NULL
      OR v_user_id IS DISTINCT FROM get_org_members.user_id
      OR NOT public.rbac_check_permission_request(
        public.rbac_perm_org_read_members(),
        get_org_members.guild_id,
        NULL::character varying,
        NULL::bigint
      )
    THEN
      PERFORM public.pg_log(
        'deny: NO_RIGHTS',
        jsonb_build_object(
          'guild_id', get_org_members.guild_id,
          'uid', v_user_id,
          'requested_uid', get_org_members.user_id
        )
      );
      RAISE EXCEPTION 'NO_RIGHTS';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    o.id AS aid,
    users.id AS uid,
    users.email,
    users.image_url,
    COALESCE(o.rbac_role_name, public.rbac_role_org_member()) AS role,
    o.is_invite AS is_tmp
  FROM public.org_users o
  JOIN public.users ON users.id = o.user_id
  WHERE o.org_id = get_org_members.guild_id
  UNION ALL
  SELECT
    (-tmp.id)::bigint AS aid,
    tmp.future_uuid AS uid,
    tmp.email::varchar,
    ''::varchar AS image_url,
    tmp.rbac_role_name AS role,
    true AS is_tmp
  FROM public.tmp_users tmp
  WHERE tmp.org_id = get_org_members.guild_id
    AND tmp.cancelled_at IS NULL
    AND GREATEST(tmp.updated_at, tmp.created_at) > (CURRENT_TIMESTAMP - INTERVAL '7 days');
END;
$$;

ALTER FUNCTION public.get_org_members(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_org_members(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_members(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_org_members(guild_id uuid)
RETURNS TABLE(aid bigint, uid uuid, email character varying, image_url character varying, role text, is_tmp boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role()) THEN
    v_user_id := public.request_actor_user_id();

    IF v_user_id IS NULL
      OR NOT public.rbac_check_permission_request(
        public.rbac_perm_org_read_members(),
        get_org_members.guild_id,
        NULL::character varying,
        NULL::bigint
      )
    THEN
      PERFORM public.pg_log(
        'deny: NO_RIGHTS',
        jsonb_build_object('guild_id', get_org_members.guild_id, 'uid', v_user_id)
      );
      RAISE EXCEPTION 'NO_RIGHTS';
    END IF;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.get_org_members(v_user_id, get_org_members.guild_id);
END;
$$;

ALTER FUNCTION public.get_org_members(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_org_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_members(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_org_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_members(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_org_members_rbac(p_org_id uuid)
RETURNS TABLE(user_id uuid, email character varying, image_url character varying, role_name text, role_id uuid, binding_id uuid, granted_at timestamp with time zone, is_invite boolean, is_tmp boolean, org_user_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.rbac_check_permission_request(
    public.rbac_perm_org_read_members(),
    p_org_id,
    NULL::character varying,
    NULL::bigint
  ) THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_VIEW_MEMBERS';
  END IF;

  RETURN QUERY
  WITH rbac_members AS (
    SELECT
      u.id AS user_id,
      u.email,
      u.image_url,
      r.name AS role_name,
      rb.role_id,
      rb.id AS binding_id,
      rb.granted_at,
      false AS is_invite,
      false AS is_tmp,
      NULL::bigint AS org_user_id
    FROM public.users u
    INNER JOIN public.role_bindings rb ON rb.principal_id = u.id
      AND rb.principal_type = public.rbac_principal_user()
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id = p_org_id
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    INNER JOIN public.roles r ON rb.role_id = r.id
      AND r.scope_type = rb.scope_type
    WHERE r.scope_type = public.rbac_scope_org()
      AND r.name LIKE 'org_%'
  ),
  pending_user_invites AS (
    SELECT
      u.id AS user_id,
      u.email,
      u.image_url,
      COALESCE(ou.rbac_role_name, public.rbac_role_org_member()) AS role_name,
      NULL::uuid AS role_id,
      NULL::uuid AS binding_id,
      ou.created_at AS granted_at,
      true AS is_invite,
      false AS is_tmp,
      ou.id AS org_user_id
    FROM public.org_users ou
    INNER JOIN public.users u ON u.id = ou.user_id
    WHERE ou.org_id = p_org_id
      AND ou.is_invite IS TRUE
  ),
  tmp_invites AS (
    SELECT
      tmp.future_uuid AS user_id,
      tmp.email,
      ''::character varying AS image_url,
      tmp.rbac_role_name AS role_name,
      NULL::uuid AS role_id,
      NULL::uuid AS binding_id,
      GREATEST(tmp.updated_at, tmp.created_at) AS granted_at,
      true AS is_invite,
      true AS is_tmp,
      NULL::bigint AS org_user_id
    FROM public.tmp_users tmp
    WHERE tmp.org_id = p_org_id
      AND tmp.cancelled_at IS NULL
      AND GREATEST(tmp.updated_at, tmp.created_at) > (CURRENT_TIMESTAMP - INTERVAL '7 days')
  )
  SELECT *
  FROM (
    SELECT * FROM rbac_members
    UNION ALL
    SELECT * FROM pending_user_invites
    UNION ALL
    SELECT * FROM tmp_invites
  ) AS combined
  ORDER BY is_tmp ASC, is_invite ASC, email ASC;
END;
$$;

ALTER FUNCTION public.get_org_members_rbac(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_org_members_rbac(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_members_rbac(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_org_members_rbac(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_members_rbac(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.invite_user_to_org_rbac(email character varying, org_id uuid, role_name text)
RETURNS character varying
LANGUAGE plpgsql
SECURITY DEFINER
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

  SELECT public.users.id INTO invited_user FROM public.users WHERE public.users.email = invite_user_to_org_rbac.email;

  IF invited_user IS NOT NULL THEN
    SELECT public.org_users.id INTO current_record
    FROM public.org_users
    WHERE public.org_users.user_id = invited_user.id
      AND public.org_users.org_id = invite_user_to_org_rbac.org_id;

    IF current_record IS NOT NULL THEN
      RETURN 'ALREADY_INVITED';
    ELSE
      INSERT INTO public.org_users (user_id, org_id, rbac_role_name, is_invite)
      VALUES (invited_user.id, invite_user_to_org_rbac.org_id, invite_user_to_org_rbac.role_name, true);

      INSERT INTO public.role_bindings (
        principal_type, principal_id, role_id, scope_type, org_id,
        granted_by, granted_at, expires_at, reason, is_direct
      ) VALUES (
        public.rbac_principal_user(), invited_user.id, role_id, public.rbac_scope_org(), invite_user_to_org_rbac.org_id,
        COALESCE(v_granted_by, invited_user.id), now(), now() - INTERVAL '1 second', 'Pending invitation', true
      ) ON CONFLICT DO NOTHING;

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

ALTER FUNCTION public.invite_user_to_org_rbac(character varying, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.invite_user_to_org_rbac(character varying, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_user_to_org_rbac(character varying, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.invite_user_to_org_rbac(character varying, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_user_to_org_rbac(character varying, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.accept_invitation_to_org(org_id uuid)
RETURNS character varying
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  invite public.org_users%ROWTYPE;
  invite_user_id uuid;
  invite_org_id uuid;
  role_name text;
  role_id uuid;
BEGIN
  SELECT public.org_users.*
  INTO invite
  FROM public.org_users
  WHERE public.org_users.org_id = accept_invitation_to_org.org_id
    AND public.org_users.user_id = auth.uid()
    AND public.org_users.is_invite IS TRUE
  ORDER BY public.org_users.created_at DESC NULLS LAST,
    public.org_users.id DESC
  LIMIT 1;

  IF invite.id IS NOT NULL THEN
    IF invite.rbac_role_name IS NULL THEN
      RETURN 'ROLE_NOT_FOUND';
    END IF;
    invite_user_id := invite.user_id;
    invite_org_id := invite.org_id;
    role_name := invite.rbac_role_name;
  ELSE
    SELECT rb.principal_id, rb.org_id, r.name
    INTO invite_user_id, invite_org_id, role_name
    FROM public.role_bindings rb
    JOIN public.roles r
      ON r.id = rb.role_id
      AND r.scope_type = rb.scope_type
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = auth.uid()
      AND rb.org_id = accept_invitation_to_org.org_id
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.reason IN ('Pending invitation', 'Invited via invite_user_to_org_rbac')
    ORDER BY rb.granted_at DESC NULLS LAST
    LIMIT 1;

    IF invite_user_id IS NULL THEN
      RETURN 'NO_INVITE';
    END IF;
  END IF;

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

  IF invite.id IS NULL THEN
    INSERT INTO public.org_users (user_id, org_id, rbac_role_name, is_invite)
    VALUES (invite_user_id, invite_org_id, role_name, false);
  ELSE
    UPDATE public.org_users
    SET is_invite = false,
        rbac_role_name = role_name,
        updated_at = CURRENT_TIMESTAMP
    WHERE public.org_users.id = invite.id;
  END IF;

  DELETE FROM public.role_bindings
  WHERE public.role_bindings.principal_type = public.rbac_principal_user()
    AND public.role_bindings.principal_id = invite_user_id
    AND public.role_bindings.scope_type = public.rbac_scope_org()
    AND public.role_bindings.org_id = invite_org_id;

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
    invite_user_id,
    role_id,
    public.rbac_scope_org(),
    invite_org_id,
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

ALTER FUNCTION public.accept_invitation_to_org(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.accept_invitation_to_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invitation_to_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation_to_org(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.update_org_invite_role_rbac(p_org_id uuid, p_user_id uuid, p_new_role_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  role_id uuid;
BEGIN
  SELECT id INTO role_id
  FROM public.roles r
  WHERE r.name = p_new_role_name
    AND r.scope_type = public.rbac_scope_org()
    AND r.is_assignable = true
  LIMIT 1;

  IF role_id IS NULL THEN
    RAISE EXCEPTION 'ROLE_NOT_FOUND';
  END IF;

  IF p_new_role_name = public.rbac_role_org_super_admin() THEN
    IF NOT public.rbac_check_permission_request(public.rbac_perm_org_update_user_roles(), p_org_id, NULL::character varying, NULL::bigint) THEN
      RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
    END IF;
  ELSE
    IF NOT public.rbac_check_permission_request(public.rbac_perm_org_invite_user(), p_org_id, NULL::character varying, NULL::bigint) THEN
      RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
    END IF;
  END IF;

  UPDATE public.org_users
  SET rbac_role_name = p_new_role_name,
      updated_at = now()
  WHERE org_id = p_org_id
    AND user_id = p_user_id
    AND is_invite IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_INVITATION';
  END IF;

  RETURN 'OK';
END;
$$;

ALTER FUNCTION public.update_org_invite_role_rbac(uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_org_invite_role_rbac(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_org_invite_role_rbac(uuid, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.update_org_invite_role_rbac(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_org_invite_role_rbac(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.update_tmp_invite_role_rbac(p_org_id uuid, p_email text, p_new_role_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  role_id uuid;
BEGIN
  SELECT id INTO role_id
  FROM public.roles r
  WHERE r.name = p_new_role_name
    AND r.scope_type = public.rbac_scope_org()
    AND r.is_assignable = true
  LIMIT 1;

  IF role_id IS NULL THEN
    RAISE EXCEPTION 'ROLE_NOT_FOUND';
  END IF;

  IF p_new_role_name = public.rbac_role_org_super_admin() THEN
    IF NOT public.rbac_check_permission_request(public.rbac_perm_org_update_user_roles(), p_org_id, NULL::character varying, NULL::bigint) THEN
      RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
    END IF;
  ELSE
    IF NOT public.rbac_check_permission_request(public.rbac_perm_org_invite_user(), p_org_id, NULL::character varying, NULL::bigint) THEN
      RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
    END IF;
  END IF;

  UPDATE public.tmp_users
  SET rbac_role_name = p_new_role_name,
      updated_at = now()
  WHERE org_id = p_org_id
    AND email = p_email
    AND cancelled_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_INVITATION';
  END IF;

  RETURN 'OK';
END;
$$;

ALTER FUNCTION public.update_tmp_invite_role_rbac(uuid, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_tmp_invite_role_rbac(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_tmp_invite_role_rbac(uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.update_tmp_invite_role_rbac(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_tmp_invite_role_rbac(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.is_member_of_org(user_id uuid, org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role()) THEN
    v_actor_id := public.request_actor_user_id();

    IF v_actor_id IS NULL
      OR v_actor_id <> is_member_of_org.user_id
      OR NOT public.rbac_check_permission_request(
        public.rbac_perm_org_read(),
        is_member_of_org.org_id,
        NULL::character varying,
        NULL::bigint
      )
    THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = is_member_of_org.user_id
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id = is_member_of_org.org_id
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  );
END;
$$;

ALTER FUNCTION public.is_member_of_org(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_member_of_org(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_member_of_org(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_member_of_org(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member_of_org(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.check_org_members_2fa_enabled(org_id uuid)
RETURNS TABLE(user_id uuid, "2fa_enabled" boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE public.orgs.id = check_org_members_2fa_enabled.org_id) THEN
    RAISE EXCEPTION 'Organization does not exist';
  END IF;

  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_update_settings(),
      check_org_members_2fa_enabled.org_id,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    rb.principal_id AS user_id,
    COALESCE(public.has_2fa_enabled(rb.principal_id), false) AS "2fa_enabled"
  FROM public.role_bindings rb
  JOIN public.roles r ON r.id = rb.role_id
    AND r.scope_type = rb.scope_type
  WHERE rb.principal_type = public.rbac_principal_user()
    AND rb.scope_type = public.rbac_scope_org()
    AND rb.org_id = check_org_members_2fa_enabled.org_id
    AND (rb.expires_at IS NULL OR rb.expires_at > now())
    AND r.name LIKE 'org_%';
END;
$$;

ALTER FUNCTION public.check_org_members_2fa_enabled(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.check_org_members_2fa_enabled(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_org_members_2fa_enabled(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.check_org_members_2fa_enabled(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_org_members_2fa_enabled(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.check_org_members_password_policy(org_id uuid)
RETURNS TABLE(user_id uuid, email text, first_name text, last_name text, password_policy_compliant boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_update_settings(),
      check_org_members_password_policy.org_id,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.orgs
    WHERE public.orgs.id = check_org_members_password_policy.org_id
  ) THEN
    RAISE EXCEPTION 'Organization does not exist';
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    rb.principal_id AS user_id,
    au.email::text,
    u.first_name::text,
    u.last_name::text,
    public.user_meets_password_policy(rb.principal_id, check_org_members_password_policy.org_id) AS password_policy_compliant
  FROM public.role_bindings rb
  JOIN public.roles r ON r.id = rb.role_id
    AND r.scope_type = rb.scope_type
  JOIN auth.users au ON au.id = rb.principal_id
  LEFT JOIN public.users u ON u.id = rb.principal_id
  WHERE rb.principal_type = public.rbac_principal_user()
    AND rb.scope_type = public.rbac_scope_org()
    AND rb.org_id = check_org_members_password_policy.org_id
    AND (rb.expires_at IS NULL OR rb.expires_at > now())
    AND r.name LIKE 'org_%';
END;
$$;

ALTER FUNCTION public.check_org_members_password_policy(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.check_org_members_password_policy(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_org_members_password_policy(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.check_org_members_password_policy(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_org_members_password_policy(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.check_if_org_can_exist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.orgs
  WHERE orgs.id = OLD.org_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.role_bindings rb
      JOIN public.roles r ON r.id = rb.role_id
        AND r.scope_type = rb.scope_type
      WHERE rb.principal_type = public.rbac_principal_user()
        AND rb.principal_id <> OLD.user_id
        AND rb.scope_type = public.rbac_scope_org()
        AND rb.org_id = OLD.org_id
        AND (rb.expires_at IS NULL OR rb.expires_at > now())
        AND r.name = public.rbac_role_org_super_admin()
    );

  RETURN OLD;
END;
$$;

ALTER FUNCTION public.check_if_org_can_exist() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.check_if_org_can_exist() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_if_org_can_exist() TO service_role;

DROP TRIGGER IF EXISTS sync_org_user_to_role_binding_on_insert ON public.org_users;
DROP TRIGGER IF EXISTS sync_org_user_role_binding_on_update ON public.org_users;
DROP TRIGGER IF EXISTS sync_org_user_role_binding_on_delete ON public.org_users;

DROP FUNCTION IF EXISTS public.sync_org_user_to_role_binding();
DROP FUNCTION IF EXISTS public.sync_org_user_role_binding_on_update();
DROP FUNCTION IF EXISTS public.sync_org_user_role_binding_on_delete();
DROP FUNCTION IF EXISTS public.resync_org_user_role_bindings(uuid, uuid);

ALTER TABLE public.org_users
  DROP COLUMN IF EXISTS user_right;

ALTER TABLE public.tmp_users
  DROP COLUMN IF EXISTS role;

DROP FUNCTION IF EXISTS public.rbac_user_right_for_org_role(text);
DROP FUNCTION IF EXISTS public.rbac_invite_user_right_for_org_role(text);
DROP FUNCTION IF EXISTS public.rbac_right_admin();
DROP FUNCTION IF EXISTS public.rbac_right_invite_admin();
DROP FUNCTION IF EXISTS public.rbac_right_invite_super_admin();
DROP FUNCTION IF EXISTS public.rbac_right_invite_upload();
DROP FUNCTION IF EXISTS public.rbac_right_invite_write();
DROP FUNCTION IF EXISTS public.rbac_right_read();
DROP FUNCTION IF EXISTS public.rbac_right_super_admin();
DROP FUNCTION IF EXISTS public.rbac_right_upload();
DROP FUNCTION IF EXISTS public.rbac_right_write();
DROP FUNCTION IF EXISTS public.rbac_migrate_org_users_to_bindings(uuid, uuid);
DROP FUNCTION IF EXISTS public.rbac_preview_migration(uuid);
DROP FUNCTION IF EXISTS public.rbac_enable_for_org(uuid, uuid);
DROP FUNCTION IF EXISTS public.rbac_rollback_org(uuid);
DROP FUNCTION IF EXISTS public.rbac_is_enabled_for_org(uuid);
DROP FUNCTION IF EXISTS public.force_org_rbac_enabled();
DROP FUNCTION IF EXISTS public.get_org_perm_for_apikey(text, text);
DROP FUNCTION IF EXISTS public.get_org_perm_for_apikey_v2(text, text);
DROP FUNCTION IF EXISTS public.exist_app(character varying);
DROP FUNCTION IF EXISTS public.is_allowed_capgkey(text, text[]);
DROP FUNCTION IF EXISTS public.is_allowed_capgkey(text, text[], character varying);

DROP TYPE IF EXISTS public.key_mode;
DROP TYPE IF EXISTS public.user_min_right;

CREATE OR REPLACE FUNCTION public.exist_app(appid character varying)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.exist_app_v2(appid);
$$;

ALTER FUNCTION public.exist_app(character varying) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.exist_app(character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exist_app(character varying) TO anon;
GRANT EXECUTE ON FUNCTION public.exist_app(character varying) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exist_app(character varying) TO service_role;
COMMENT ON FUNCTION public.exist_app(character varying) IS 'Compatibility RPC for pre-RBAC CLIs. App existence is still authorized through exist_app_v2 and RBAC.';

CREATE OR REPLACE FUNCTION public.is_allowed_capgkey(apikey text, keymode text[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_api_key public.apikeys%ROWTYPE;
  v_modes text[];
BEGIN
  SELECT *
  INTO v_api_key
  FROM public.find_apikey_by_value(apikey)
  LIMIT 1;

  IF v_api_key.id IS NULL OR public.is_apikey_expired(v_api_key.expires_at) THEN
    RETURN false;
  END IF;

  SELECT COALESCE(array_agg(lower(mode_value)), ARRAY[]::text[])
  INTO v_modes
  FROM unnest(COALESCE(keymode, ARRAY[]::text[])) AS mode_value;

  IF cardinality(v_modes) = 0 THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    JOIN public.roles r
      ON r.id = rb.role_id
      AND r.scope_type = rb.scope_type
    JOIN public.role_permissions rp
      ON rp.role_id = r.id
    JOIN public.permissions p
      ON p.id = rp.permission_id
    WHERE rb.principal_type = public.rbac_principal_apikey()
      AND rb.principal_id = v_api_key.rbac_id
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
      AND (
        ('read' = ANY(v_modes) AND p.key IN (
          public.rbac_perm_org_read(),
          public.rbac_perm_app_read(),
          public.rbac_perm_app_read_bundles(),
          public.rbac_perm_channel_read()
        ))
        OR ('upload' = ANY(v_modes) AND p.key = public.rbac_perm_app_upload_bundle())
        OR ('write' = ANY(v_modes) AND p.key IN (
          public.rbac_perm_app_update_settings(),
          public.rbac_perm_app_create_channel(),
          public.rbac_perm_bundle_update(),
          public.rbac_perm_channel_update_settings()
        ))
        OR ('all' = ANY(v_modes) AND p.key IN (
          public.rbac_perm_org_delete(),
          public.rbac_perm_org_update_user_roles(),
          public.rbac_perm_app_delete(),
          public.rbac_perm_app_update_user_roles(),
          public.rbac_perm_app_transfer()
        ))
      )
  );
END;
$$;

ALTER FUNCTION public.is_allowed_capgkey(text, text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_allowed_capgkey(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_allowed_capgkey(text, text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.is_allowed_capgkey(text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_allowed_capgkey(text, text[]) TO service_role;
COMMENT ON FUNCTION public.is_allowed_capgkey(text, text[]) IS 'Compatibility RPC for pre-RBAC CLIs. Legacy mode words are request vocabulary only; authorization is evaluated from RBAC role_bindings.';

CREATE OR REPLACE FUNCTION public.is_allowed_capgkey(apikey text, keymode text[], appid character varying)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_api_key public.apikeys%ROWTYPE;
  v_owner_org uuid;
  v_modes text[];
BEGIN
  SELECT *
  INTO v_api_key
  FROM public.find_apikey_by_value(apikey)
  LIMIT 1;

  IF v_api_key.id IS NULL OR public.is_apikey_expired(v_api_key.expires_at) THEN
    RETURN false;
  END IF;

  SELECT apps.owner_org
  INTO v_owner_org
  FROM public.apps
  WHERE apps.app_id = is_allowed_capgkey.appid
  LIMIT 1;

  IF v_owner_org IS NULL THEN
    RETURN false;
  END IF;

  SELECT COALESCE(array_agg(lower(mode_value)), ARRAY[]::text[])
  INTO v_modes
  FROM unnest(COALESCE(keymode, ARRAY[]::text[])) AS mode_value;

  IF cardinality(v_modes) = 0 THEN
    RETURN false;
  END IF;

  RETURN (
    ('read' = ANY(v_modes) AND (
      public.rbac_check_permission_direct(public.rbac_perm_app_read(), v_api_key.user_id, v_owner_org, appid, NULL::bigint, apikey)
      OR public.rbac_check_permission_direct(public.rbac_perm_app_read_bundles(), v_api_key.user_id, v_owner_org, appid, NULL::bigint, apikey)
      OR public.rbac_check_permission_direct(public.rbac_perm_channel_read(), v_api_key.user_id, v_owner_org, appid, NULL::bigint, apikey)
    ))
    OR ('upload' = ANY(v_modes) AND public.rbac_check_permission_direct(public.rbac_perm_app_upload_bundle(), v_api_key.user_id, v_owner_org, appid, NULL::bigint, apikey))
    OR ('write' = ANY(v_modes) AND (
      public.rbac_check_permission_direct(public.rbac_perm_app_update_settings(), v_api_key.user_id, v_owner_org, appid, NULL::bigint, apikey)
      OR public.rbac_check_permission_direct(public.rbac_perm_app_create_channel(), v_api_key.user_id, v_owner_org, appid, NULL::bigint, apikey)
      OR public.rbac_check_permission_direct(public.rbac_perm_bundle_update(), v_api_key.user_id, v_owner_org, appid, NULL::bigint, apikey)
      OR public.rbac_check_permission_direct(public.rbac_perm_channel_update_settings(), v_api_key.user_id, v_owner_org, appid, NULL::bigint, apikey)
    ))
    OR ('all' = ANY(v_modes) AND (
      public.rbac_check_permission_direct(public.rbac_perm_org_delete(), v_api_key.user_id, v_owner_org, appid, NULL::bigint, apikey)
      OR public.rbac_check_permission_direct(public.rbac_perm_org_update_user_roles(), v_api_key.user_id, v_owner_org, appid, NULL::bigint, apikey)
      OR public.rbac_check_permission_direct(public.rbac_perm_app_delete(), v_api_key.user_id, v_owner_org, appid, NULL::bigint, apikey)
      OR public.rbac_check_permission_direct(public.rbac_perm_app_update_user_roles(), v_api_key.user_id, v_owner_org, appid, NULL::bigint, apikey)
      OR public.rbac_check_permission_direct(public.rbac_perm_app_transfer(), v_api_key.user_id, v_owner_org, appid, NULL::bigint, apikey)
    ))
  );
END;
$$;

ALTER FUNCTION public.is_allowed_capgkey(text, text[], character varying) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_allowed_capgkey(text, text[], character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_allowed_capgkey(text, text[], character varying) TO anon;
GRANT EXECUTE ON FUNCTION public.is_allowed_capgkey(text, text[], character varying) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_allowed_capgkey(text, text[], character varying) TO service_role;
COMMENT ON FUNCTION public.is_allowed_capgkey(text, text[], character varying) IS 'Compatibility RPC for pre-RBAC CLIs. App-scoped legacy mode checks delegate to RBAC permissions for that app.';

CREATE OR REPLACE FUNCTION public.get_org_perm_for_apikey(apikey text, app_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_api_key public.apikeys%ROWTYPE;
  v_owner_org uuid;
  v_app_id character varying;
BEGIN
  SELECT *
  INTO v_api_key
  FROM public.find_apikey_by_value(apikey)
  LIMIT 1;

  IF v_api_key.id IS NULL OR public.is_apikey_expired(v_api_key.expires_at) THEN
    RETURN 'INVALID_APIKEY';
  END IF;

  SELECT apps.owner_org, apps.app_id
  INTO v_owner_org, v_app_id
  FROM public.apps
  WHERE apps.app_id = get_org_perm_for_apikey.app_id::character varying
  LIMIT 1;

  IF v_app_id IS NULL THEN
    RETURN 'NO_APP';
  END IF;

  IF v_owner_org IS NULL THEN
    RETURN 'NO_ORG';
  END IF;

  IF public.rbac_check_permission_direct(public.rbac_perm_org_delete(), v_api_key.user_id, v_owner_org, v_app_id, NULL::bigint, apikey)
    OR public.rbac_check_permission_direct(public.rbac_perm_app_delete(), v_api_key.user_id, v_owner_org, v_app_id, NULL::bigint, apikey)
    OR public.rbac_check_permission_direct(public.rbac_perm_app_transfer(), v_api_key.user_id, v_owner_org, v_app_id, NULL::bigint, apikey)
  THEN
    RETURN 'perm_owner';
  END IF;

  IF public.rbac_check_permission_direct(public.rbac_perm_org_update_user_roles(), v_api_key.user_id, v_owner_org, v_app_id, NULL::bigint, apikey)
    OR public.rbac_check_permission_direct(public.rbac_perm_app_update_user_roles(), v_api_key.user_id, v_owner_org, v_app_id, NULL::bigint, apikey)
    OR public.rbac_check_permission_direct(public.rbac_perm_app_update_settings(), v_api_key.user_id, v_owner_org, v_app_id, NULL::bigint, apikey)
    OR public.rbac_check_permission_direct(public.rbac_perm_app_create_channel(), v_api_key.user_id, v_owner_org, v_app_id, NULL::bigint, apikey)
    OR public.rbac_check_permission_direct(public.rbac_perm_channel_update_settings(), v_api_key.user_id, v_owner_org, v_app_id, NULL::bigint, apikey)
  THEN
    RETURN 'perm_admin';
  END IF;

  IF public.rbac_check_permission_direct(public.rbac_perm_bundle_update(), v_api_key.user_id, v_owner_org, v_app_id, NULL::bigint, apikey) THEN
    RETURN 'perm_write';
  END IF;

  IF public.rbac_check_permission_direct(public.rbac_perm_app_upload_bundle(), v_api_key.user_id, v_owner_org, v_app_id, NULL::bigint, apikey) THEN
    RETURN 'perm_upload';
  END IF;

  IF public.rbac_check_permission_direct(public.rbac_perm_app_read(), v_api_key.user_id, v_owner_org, v_app_id, NULL::bigint, apikey)
    OR public.rbac_check_permission_direct(public.rbac_perm_app_read_bundles(), v_api_key.user_id, v_owner_org, v_app_id, NULL::bigint, apikey)
    OR public.rbac_check_permission_direct(public.rbac_perm_channel_read(), v_api_key.user_id, v_owner_org, v_app_id, NULL::bigint, apikey)
    OR public.rbac_check_permission_direct(public.rbac_perm_org_read(), v_api_key.user_id, v_owner_org, v_app_id, NULL::bigint, apikey)
  THEN
    RETURN 'perm_read';
  END IF;

  RETURN 'perm_none';
END;
$$;

ALTER FUNCTION public.get_org_perm_for_apikey(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_org_perm_for_apikey(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_perm_for_apikey(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_org_perm_for_apikey(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_perm_for_apikey(text, text) TO service_role;
COMMENT ON FUNCTION public.get_org_perm_for_apikey(text, text) IS 'Compatibility RPC for pre-RBAC CLIs. The returned legacy rank is derived only from RBAC permissions.';

CREATE OR REPLACE FUNCTION public.get_org_perm_for_apikey_v2(apikey text, app_id text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.get_org_perm_for_apikey(apikey, app_id);
$$;

ALTER FUNCTION public.get_org_perm_for_apikey_v2(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_org_perm_for_apikey_v2(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_perm_for_apikey_v2(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_org_perm_for_apikey_v2(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_perm_for_apikey_v2(text, text) TO service_role;
COMMENT ON FUNCTION public.get_org_perm_for_apikey_v2(text, text) IS 'Compatibility alias for pre-RBAC CLIs; delegates to the RBAC-backed get_org_perm_for_apikey wrapper.';

REVOKE ALL ON FUNCTION public.get_user_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_id(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id(text) TO service_role;
REVOKE ALL ON FUNCTION public.get_user_id(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_id(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_id(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id(text, text) TO service_role;
COMMENT ON FUNCTION public.get_user_id(text) IS 'Compatibility RPC for old CLIs. It resolves valid non-expired API keys, including hashed keys, and does not authorize any write by itself.';
COMMENT ON FUNCTION public.get_user_id(text, text) IS 'Compatibility RPC for old CLIs. The app_id argument is ignored; write authorization must be checked through RBAC.';

CREATE OR REPLACE FUNCTION public.regenerate_hashed_apikey(p_apikey_id bigint)
RETURNS public.apikeys
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := public.request_actor_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No authentication provided';
  END IF;

  RETURN public.regenerate_hashed_apikey_for_user(p_apikey_id, v_user_id);
END;
$$;

ALTER FUNCTION public.regenerate_hashed_apikey(bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.regenerate_hashed_apikey(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regenerate_hashed_apikey(bigint) TO anon;
GRANT EXECUTE ON FUNCTION public.regenerate_hashed_apikey(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_hashed_apikey(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.set_webhook_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  creator_id uuid;
BEGIN
  creator_id := public.request_actor_user_id();

  IF creator_id IS NOT NULL THEN
    NEW.created_by := creator_id;
  ELSIF NEW.created_by IS NULL THEN
    SELECT orgs.created_by
    INTO creator_id
    FROM public.orgs AS orgs
    WHERE orgs.id = NEW.org_id;

    NEW.created_by := creator_id;
  END IF;

  IF NEW.created_by IS NULL THEN
    RAISE EXCEPTION 'webhooks.created_by cannot be null';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.set_webhook_created_by() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_webhook_created_by() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_webhook_created_by() TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_version_meta(p_app_id character varying, p_version_id bigint, p_size bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_org uuid;
  v_existing_count integer;
  v_version_exists boolean;
BEGIN
  IF p_size = 0 THEN
    RETURN FALSE;
  END IF;

  SELECT owner_org
  INTO v_owner_org
  FROM public.apps
  WHERE app_id = p_app_id
  LIMIT 1;

  IF v_owner_org IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.app_versions av
    WHERE av.app_id = p_app_id
      AND av.id = p_version_id
  )
  INTO v_version_exists;

  IF NOT v_version_exists THEN
    RETURN FALSE;
  END IF;

  IF COALESCE(current_setting('role', true), '') NOT IN ('service_role', 'postgres')
    AND COALESCE(session_user, current_user) NOT IN ('service_role', 'postgres')
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_app_upload_bundle(),
      v_owner_org,
      p_app_id,
      NULL::bigint
    )
  THEN
    RETURN FALSE;
  END IF;

  IF p_size > 0 THEN
    SELECT COUNT(*) INTO v_existing_count
    FROM public.version_meta
    WHERE public.version_meta.app_id = p_app_id
      AND public.version_meta.version_id = p_version_id
      AND public.version_meta.size > 0;
  ELSIF p_size < 0 THEN
    SELECT COUNT(*) INTO v_existing_count
    FROM public.version_meta
    WHERE public.version_meta.app_id = p_app_id
      AND public.version_meta.version_id = p_version_id
      AND public.version_meta.size < 0;
  END IF;

  IF v_existing_count > 0 THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.version_meta (app_id, version_id, size)
  VALUES (p_app_id, p_version_id, p_size);

  RETURN TRUE;
EXCEPTION
  WHEN unique_violation THEN
    RETURN FALSE;
END;
$$;

ALTER FUNCTION public.upsert_version_meta(character varying, bigint, bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.upsert_version_meta(character varying, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_version_meta(character varying, bigint, bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.app_versions_readable_app_ids()
RETURNS character varying[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

ALTER FUNCTION public.app_versions_readable_app_ids() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.app_versions_readable_app_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_versions_readable_app_ids() TO anon;
GRANT EXECUTE ON FUNCTION public.app_versions_readable_app_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_versions_readable_app_ids() TO service_role;

CREATE OR REPLACE FUNCTION public.generate_org_user_stripe_info_on_org_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  solo_plan_stripe_id varchar;
  pending_customer_id varchar;
  trial_at_date timestamptz;
  org_super_admin_role_id uuid;
BEGIN
  PERFORM set_config('capgo.org_creation_bootstrap_org_id', NEW.id::text, true);

  INSERT INTO public.org_users (user_id, org_id, rbac_role_name, is_invite)
  VALUES (NEW.created_by, NEW.id, public.rbac_role_org_super_admin(), false);

  SELECT id INTO org_super_admin_role_id
  FROM public.roles
  WHERE name = public.rbac_role_org_super_admin()
    AND scope_type = public.rbac_scope_org()
  LIMIT 1;

  IF org_super_admin_role_id IS NOT NULL THEN
    INSERT INTO public.role_bindings (
      principal_type, principal_id, role_id, scope_type, org_id,
      granted_by, granted_at, reason, is_direct
    ) VALUES (
      public.rbac_principal_user(), NEW.created_by, org_super_admin_role_id, public.rbac_scope_org(), NEW.id,
      NEW.created_by, now(), 'Organization creator', true
    ) ON CONFLICT DO NOTHING;
  END IF;

  PERFORM set_config('capgo.org_creation_bootstrap_org_id', '', true);

  IF NEW.customer_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT stripe_id INTO solo_plan_stripe_id
  FROM public.plans
  WHERE name = 'Solo'
  LIMIT 1;

  IF solo_plan_stripe_id IS NULL THEN
    RAISE WARNING 'Solo plan not found, skipping sync stripe_info creation for org %', NEW.id;
    RETURN NEW;
  END IF;

  pending_customer_id := 'pending_' || NEW.id::text;
  trial_at_date := NOW() + INTERVAL '15 days';

  INSERT INTO public.stripe_info (
    customer_id,
    product_id,
    trial_at,
    status,
    is_good_plan
  ) VALUES (
    pending_customer_id,
    solo_plan_stripe_id,
    trial_at_date,
    NULL,
    true
  );

  UPDATE public.orgs
  SET customer_id = pending_customer_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.generate_org_user_stripe_info_on_org_create() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.generate_org_user_stripe_info_on_org_create() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_org_user_stripe_info_on_org_create() TO service_role;

CREATE OR REPLACE FUNCTION public.get_orgs_v7(userid uuid)
RETURNS TABLE(gid uuid, created_by uuid, created_at timestamp with time zone, logo text, website text, name text, role character varying, is_invite boolean, paying boolean, trial_left integer, can_use_more boolean, is_canceled boolean, app_count bigint, subscription_start timestamp with time zone, subscription_end timestamp with time zone, management_email text, is_yearly boolean, stats_updated_at timestamp without time zone, stats_refresh_requested_at timestamp without time zone, next_stats_update_at timestamp with time zone, credit_available numeric, credit_total numeric, credit_next_expiration timestamp with time zone, enforcing_2fa boolean, "2fa_has_access" boolean, enforce_hashed_api_keys boolean, password_policy_config jsonb, password_has_access boolean, require_apikey_expiration boolean, max_apikey_expiration_days integer, enforce_encrypted_bundles boolean, required_encryption_key character varying)
LANGUAGE plpgsql
SECURITY DEFINER
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
      AND r.scope_type = rb.scope_type
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
      AND r.scope_type = rb.scope_type
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
  pending_invites AS (
    SELECT ou.org_id, COALESCE(ou.rbac_role_name, public.rbac_role_org_member()) AS role_name
    FROM public.org_users ou
    WHERE ou.user_id = userid
      AND ou.is_invite IS TRUE
  ),
  user_orgs AS (
    SELECT rbac_org_ids.org_id
    FROM rbac_org_ids
    WHERE rbac_org_ids.org_id IS NOT NULL
    UNION
    SELECT pending_invites.org_id
    FROM pending_invites
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
    COALESCE(pi.role_name::varchar, ror.role_name::varchar, public.rbac_role_org_member()::varchar) AS role,
    (pi.org_id IS NOT NULL) AS is_invite,
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
    o.required_encryption_key
  FROM public.orgs o
  JOIN user_orgs uo ON uo.org_id = o.id
  LEFT JOIN pending_invites pi ON pi.org_id = o.id
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

ALTER FUNCTION public.get_orgs_v7(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_orgs_v7(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_orgs_v7(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_accounts_marked_for_deletion()
RETURNS TABLE(deleted_count integer, deleted_user_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  account_record record;
  org_record record;
  deleted_users uuid[] := ARRAY[]::uuid[];
  total_deleted integer := 0;
  other_super_admins_count integer;
  replacement_owner_id uuid;
BEGIN
  FOR account_record IN
    SELECT account_id, removal_date, removed_data
    FROM public.to_delete_accounts
    WHERE removal_date < now()
  LOOP
    BEGIN
      FOR org_record IN
        SELECT
          rb.org_id,
          bool_or(r.name = public.rbac_role_org_super_admin()) AS is_super_admin
        FROM public.role_bindings rb
        JOIN public.roles r ON r.id = rb.role_id
          AND r.scope_type = rb.scope_type
        WHERE rb.principal_type = public.rbac_principal_user()
          AND rb.principal_id = account_record.account_id
          AND rb.scope_type = public.rbac_scope_org()
          AND rb.org_id IS NOT NULL
          AND (rb.expires_at IS NULL OR rb.expires_at > now())
        GROUP BY rb.org_id
      LOOP
        replacement_owner_id := NULL;

        IF org_record.is_super_admin THEN
          SELECT COUNT(*) INTO other_super_admins_count
          FROM public.role_bindings rb
          JOIN public.roles r ON r.id = rb.role_id
            AND r.scope_type = rb.scope_type
          WHERE rb.org_id = org_record.org_id
            AND rb.principal_type = public.rbac_principal_user()
            AND rb.principal_id <> account_record.account_id
            AND rb.scope_type = public.rbac_scope_org()
            AND (rb.expires_at IS NULL OR rb.expires_at > now())
            AND r.name = public.rbac_role_org_super_admin();

          IF other_super_admins_count = 0 THEN
            DELETE FROM public.deploy_history WHERE owner_org = org_record.org_id;
            DELETE FROM public.channel_devices WHERE owner_org = org_record.org_id;
            DELETE FROM public.channels WHERE owner_org = org_record.org_id;
            DELETE FROM public.app_versions WHERE owner_org = org_record.org_id;
            DELETE FROM public.apps WHERE owner_org = org_record.org_id;
            DELETE FROM public.orgs WHERE id = org_record.org_id;
            CONTINUE;
          END IF;
        END IF;

        SELECT rb.principal_id INTO replacement_owner_id
        FROM public.role_bindings rb
        JOIN public.roles r ON r.id = rb.role_id
          AND r.scope_type = rb.scope_type
        WHERE rb.org_id = org_record.org_id
          AND rb.principal_type = public.rbac_principal_user()
          AND rb.principal_id <> account_record.account_id
          AND rb.scope_type = public.rbac_scope_org()
          AND (rb.expires_at IS NULL OR rb.expires_at > now())
          AND r.name = public.rbac_role_org_super_admin()
        ORDER BY rb.granted_at ASC
        LIMIT 1;

        IF replacement_owner_id IS NOT NULL THEN
          UPDATE public.apps
          SET user_id = replacement_owner_id, updated_at = now()
          WHERE user_id = account_record.account_id AND owner_org = org_record.org_id;

          UPDATE public.app_versions
          SET user_id = replacement_owner_id, updated_at = now()
          WHERE user_id = account_record.account_id AND owner_org = org_record.org_id;

          UPDATE public.channels
          SET created_by = replacement_owner_id, updated_at = now()
          WHERE created_by = account_record.account_id AND owner_org = org_record.org_id;

          UPDATE public.deploy_history
          SET created_by = replacement_owner_id, updated_at = now()
          WHERE created_by = account_record.account_id AND owner_org = org_record.org_id;

          UPDATE public.orgs
          SET created_by = replacement_owner_id, updated_at = now()
          WHERE id = org_record.org_id AND created_by = account_record.account_id;

          UPDATE public.audit_logs
          SET user_id = replacement_owner_id
          WHERE user_id = account_record.account_id AND org_id = org_record.org_id;
        ELSE
          RAISE WARNING 'No org_super_admin found to transfer ownership in org % for user %',
            org_record.org_id, account_record.account_id;
        END IF;
      END LOOP;

      DELETE FROM public.role_bindings
      WHERE principal_type = public.rbac_principal_user()
        AND principal_id = account_record.account_id;

      DELETE FROM public.group_members WHERE user_id = account_record.account_id;
      DELETE FROM public.org_users WHERE user_id = account_record.account_id;
      DELETE FROM public.users WHERE id = account_record.account_id;
      DELETE FROM auth.users WHERE id = account_record.account_id;
      DELETE FROM public.to_delete_accounts WHERE account_id = account_record.account_id;

      deleted_users := array_append(deleted_users, account_record.account_id);
      total_deleted := total_deleted + 1;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to delete account %: %', account_record.account_id, SQLERRM;
    END;
  END LOOP;

  deleted_count := total_deleted;
  deleted_user_ids := deleted_users;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION public.delete_accounts_marked_for_deletion() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_accounts_marked_for_deletion() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_accounts_marked_for_deletion() TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND policyname = 'Allow select for auth, api keys (super_admin+)'
  ) THEN
    ALTER POLICY "Allow select for auth, api keys (super_admin+)" ON public.audit_logs RENAME TO "Allow select via RBAC";
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'deploy_history'
      AND policyname = 'Allow users with write permissions to insert deploy history'
  ) THEN
    ALTER POLICY "Allow users with write permissions to insert deploy history" ON public.deploy_history RENAME TO "Deny insert via RBAC";
  END IF;
END;
$$;
