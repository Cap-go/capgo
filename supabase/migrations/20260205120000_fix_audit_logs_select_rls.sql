-- Fix audit_logs unfiltered SELECT timeouts by avoiding per-row identity resolution.
-- The previous policy called get_identity_org_allowed(keymode, org_id) per row, which:
-- - parses request headers per row
-- - queries apikeys per row
-- - logs deny messages per row when no API key is provided
-- On large tables this forces a slow scan and can saturate the DB under load.

-- Compute the list of org_ids the current request can read audit logs for once per statement,
-- then use a simple index-friendly predicate: org_id = ANY(...)
CREATE OR REPLACE FUNCTION "public"."audit_logs_allowed_orgs"()
RETURNS "uuid"[]
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_user_id uuid;
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
  v_allowed uuid[] := '{}'::uuid[];
  v_org_id uuid;
  v_use_rbac boolean;
  v_perm text := public.rbac_permission_for_legacy(
    public.rbac_right_super_admin(),
    public.rbac_scope_org()
  );
  v_enforcing_2fa boolean;
BEGIN
  SELECT auth.uid() INTO v_user_id;

  -- If no authenticated user, attempt Capgo API key auth (capgkey header).
  IF v_user_id IS NULL THEN
    SELECT public.get_apikey_header() INTO v_api_key_text;
    IF v_api_key_text IS NULL THEN
      RETURN v_allowed;
    END IF;

    SELECT * FROM public.find_apikey_by_value(v_api_key_text) INTO v_api_key;
    IF v_api_key.id IS NULL THEN
      RETURN v_allowed;
    END IF;

    IF NOT (v_api_key.mode = ANY('{read,upload,write,all}'::public.key_mode[])) THEN
      RETURN v_allowed;
    END IF;

    IF public.is_apikey_expired(v_api_key.expires_at) THEN
      RETURN v_allowed;
    END IF;

    v_user_id := v_api_key.user_id;
  END IF;

  -- Collect candidate orgs from legacy + RBAC bindings.
  FOR v_org_id IN
    SELECT DISTINCT org_id
    FROM (
      SELECT ou.org_id
      FROM public.org_users ou
      WHERE ou.user_id = v_user_id
        AND ou.org_id IS NOT NULL
        AND ou.app_id IS NULL
        AND ou.channel_id IS NULL
      UNION
      SELECT rb.org_id
      FROM public.role_bindings rb
      WHERE rb.principal_type = public.rbac_principal_user()
        AND rb.principal_id = v_user_id
        AND rb.scope_type = public.rbac_scope_org()
        AND rb.org_id IS NOT NULL
      UNION
      SELECT rb.org_id
      FROM public.role_bindings rb
      WHERE v_api_key.rbac_id IS NOT NULL
        AND rb.principal_type = public.rbac_principal_apikey()
        AND rb.principal_id = v_api_key.rbac_id
        AND rb.scope_type = public.rbac_scope_org()
        AND rb.org_id IS NOT NULL
    ) candidates
  LOOP
    -- Enforce API key org restrictions (if present).
    IF v_api_key.id IS NOT NULL
      AND COALESCE(array_length(v_api_key.limited_to_orgs, 1), 0) > 0
      AND NOT (v_org_id = ANY(v_api_key.limited_to_orgs))
    THEN
      CONTINUE;
    END IF;

    v_use_rbac := public.rbac_is_enabled_for_org(v_org_id);

    IF NOT v_use_rbac THEN
      -- Legacy rights (also enforces org 2FA + password policy).
      IF public.check_min_rights_legacy(
        'super_admin'::public.user_min_right,
        v_user_id,
        v_org_id,
        NULL::character varying,
        NULL::bigint
      ) THEN
        v_allowed := array_append(v_allowed, v_org_id);
      END IF;
    ELSE
      -- Mirror check_min_rights() org gating for RBAC orgs (2FA + password policy).
      SELECT o.enforcing_2fa INTO v_enforcing_2fa
      FROM public.orgs o
      WHERE o.id = v_org_id;

      IF v_enforcing_2fa = true AND NOT public.has_2fa_enabled(v_user_id) THEN
        CONTINUE;
      END IF;

      IF NOT public.user_meets_password_policy(v_user_id, v_org_id) THEN
        CONTINUE;
      END IF;

      -- Allow if the user or the API key principal has the required RBAC permission.
      IF public.rbac_has_permission(
        public.rbac_principal_user(),
        v_user_id,
        v_perm,
        v_org_id,
        NULL::character varying,
        NULL::bigint
      ) THEN
        v_allowed := array_append(v_allowed, v_org_id);
      ELSIF v_api_key.id IS NOT NULL
        AND v_api_key.rbac_id IS NOT NULL
        AND public.rbac_has_permission(
          public.rbac_principal_apikey(),
          v_api_key.rbac_id,
          v_perm,
          v_org_id,
          NULL::character varying,
          NULL::bigint
        )
      THEN
        v_allowed := array_append(v_allowed, v_org_id);
      END IF;
    END IF;
  END LOOP;

  RETURN v_allowed;
END;
$$;

DROP POLICY IF EXISTS "Allow select for auth, api keys (super_admin+)" ON "public"."audit_logs";

CREATE POLICY "Allow select for auth, api keys (super_admin+)" ON "public"."audit_logs"
FOR SELECT TO "anon", "authenticated"
USING (
  "org_id" = ANY("public"."audit_logs_allowed_orgs"())
);

-- RLS policies execute functions as the caller; grant EXECUTE explicitly (default privileges were revoked).
GRANT EXECUTE ON FUNCTION "public"."audit_logs_allowed_orgs"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."audit_logs_allowed_orgs"() TO "authenticated";
