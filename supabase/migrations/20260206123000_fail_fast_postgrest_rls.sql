-- Fail fast for unauthenticated PostgREST queries and avoid per-row API key resolution in RLS.
--
-- Goal:
-- - Unauthenticated anon requests (no capgkey header, auth.uid() is NULL) must not scan large tables.
-- - Policies should be index-friendly for common predicates (e.g. app_id IN allowed_app_ids()).
--
-- Context:
-- PostgREST requests with the public anon key can hit RLS policies. If the policy evaluates expensive
-- identity/auth logic per row (e.g. get_identity_org_appid(owner_org, app_id)), an unfiltered query can
-- trigger statement_timeouts and cause cascading failures.

-- 1) Statement-scoped guard: true only when the request is authenticated OR carries a valid Capgo API key.
CREATE OR REPLACE FUNCTION "public"."has_auth_or_valid_apikey"("keymode" "public"."key_mode"[])
RETURNS boolean
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_user_id uuid;
  v_api_key_text text;
  v_api_key record;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  IF v_user_id IS NOT NULL THEN
    RETURN true;
  END IF;

  SELECT public.get_apikey_header() INTO v_api_key_text;
  IF v_api_key_text IS NULL THEN
    RETURN false;
  END IF;

  SELECT * FROM public.find_apikey_by_value(v_api_key_text) INTO v_api_key;
  IF v_api_key.id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT (v_api_key.mode = ANY(keymode)) THEN
    RETURN false;
  END IF;

  IF public.is_apikey_expired(v_api_key.expires_at) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."has_auth_or_valid_apikey"("keymode" "public"."key_mode"[]) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."has_auth_or_valid_apikey"("keymode" "public"."key_mode"[]) TO "authenticated";

-- 2) Compute readable app_ids once per statement, then let policies use a simple index predicate:
--    app_id = ANY(allowed_read_apps()).
CREATE OR REPLACE FUNCTION "public"."allowed_read_apps"()
RETURNS text[]
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_user_id uuid;
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
  v_allowed text[] := '{}'::text[];
  v_app record;
  v_use_rbac boolean;
  v_perm text := public.rbac_permission_for_legacy(
    'read'::public.user_min_right,
    public.rbac_scope_app()
  );
  v_enforcing_2fa boolean;
BEGIN
  SELECT auth.uid() INTO v_user_id;

  -- Always load api key if present; RBAC permissions may be bound to the API key principal.
  SELECT public.get_apikey_header() INTO v_api_key_text;
  IF v_api_key_text IS NOT NULL THEN
    SELECT * FROM public.find_apikey_by_value(v_api_key_text) INTO v_api_key;
    IF v_api_key.id IS NOT NULL
      AND v_api_key.mode = ANY('{read,upload,write,all}'::public.key_mode[])
      AND NOT public.is_apikey_expired(v_api_key.expires_at)
    THEN
      IF v_user_id IS NULL THEN
        v_user_id := v_api_key.user_id;
      END IF;
    ELSE
      -- Treat invalid/mismatched/expired keys as absent (fail closed).
      v_api_key := NULL;
    END IF;
  END IF;

  -- No auth and no usable API key.
  IF v_user_id IS NULL AND v_api_key.id IS NULL THEN
    RETURN v_allowed;
  END IF;

  -- Candidate apps come from:
  -- - legacy org_users bindings (org-wide or app-wide, but not channel bindings)
  -- - RBAC org/app bindings (user principal or apikey principal)
  FOR v_app IN
    SELECT DISTINCT a.app_id, a.owner_org
    FROM public.apps a
    WHERE
      -- Legacy org membership / app access.
      EXISTS (
        SELECT 1
        FROM public.org_users ou
        WHERE ou.user_id = v_user_id
          AND ou.org_id = a.owner_org
          AND ou.channel_id IS NULL
          AND (ou.app_id IS NULL OR ou.app_id = a.app_id)
      )
      OR
      -- RBAC: org-level bindings (implies possible access across apps via inheritance).
      EXISTS (
        SELECT 1
        FROM public.role_bindings rb
        WHERE rb.scope_type = public.rbac_scope_org()
          AND rb.org_id = a.owner_org
          AND (
            (rb.principal_type = public.rbac_principal_user() AND rb.principal_id = v_user_id)
            OR
            (v_api_key.rbac_id IS NOT NULL AND rb.principal_type = public.rbac_principal_apikey() AND rb.principal_id = v_api_key.rbac_id)
          )
      )
      OR
      -- RBAC: app-level bindings (apps.id is the RBAC scope identifier).
      EXISTS (
        SELECT 1
        FROM public.role_bindings rb
        WHERE rb.scope_type = public.rbac_scope_app()
          AND rb.app_id = a.id
          AND (
            (rb.principal_type = public.rbac_principal_user() AND rb.principal_id = v_user_id)
            OR
            (v_api_key.rbac_id IS NOT NULL AND rb.principal_type = public.rbac_principal_apikey() AND rb.principal_id = v_api_key.rbac_id)
          )
      )
  LOOP
    -- Enforce API key scoping (if present).
    IF v_api_key.id IS NOT NULL
      AND COALESCE(array_length(v_api_key.limited_to_orgs, 1), 0) > 0
      AND NOT (v_app.owner_org = ANY(v_api_key.limited_to_orgs))
    THEN
      CONTINUE;
    END IF;

    IF v_api_key.id IS NOT NULL
      AND v_api_key.limited_to_apps IS DISTINCT FROM '{}'
      AND NOT (v_app.app_id = ANY(v_api_key.limited_to_apps))
    THEN
      CONTINUE;
    END IF;

    v_use_rbac := public.rbac_is_enabled_for_org(v_app.owner_org);

    IF NOT v_use_rbac THEN
      -- Legacy rights (includes org 2FA + password policy checks).
      IF public.check_min_rights_legacy(
        'read'::public.user_min_right,
        v_user_id,
        v_app.owner_org,
        v_app.app_id,
        NULL::bigint
      ) THEN
        v_allowed := array_append(v_allowed, v_app.app_id);
      END IF;
    ELSE
      -- Mirror check_min_rights() org gating for RBAC orgs (2FA + password policy).
      SELECT o.enforcing_2fa INTO v_enforcing_2fa
      FROM public.orgs o
      WHERE o.id = v_app.owner_org;

      IF v_enforcing_2fa = true AND (v_user_id IS NULL OR NOT public.has_2fa_enabled(v_user_id)) THEN
        CONTINUE;
      END IF;

      IF NOT public.user_meets_password_policy(v_user_id, v_app.owner_org) THEN
        CONTINUE;
      END IF;

      -- Allow if the user or the API key principal has the required RBAC permission.
      IF v_user_id IS NOT NULL
        AND public.rbac_has_permission(
          public.rbac_principal_user(),
          v_user_id,
          v_perm,
          v_app.owner_org,
          v_app.app_id,
          NULL::bigint
        )
      THEN
        v_allowed := array_append(v_allowed, v_app.app_id);
      ELSIF v_api_key.id IS NOT NULL
        AND v_api_key.rbac_id IS NOT NULL
        AND public.rbac_has_permission(
          public.rbac_principal_apikey(),
          v_api_key.rbac_id,
          v_perm,
          v_app.owner_org,
          v_app.app_id,
          NULL::bigint
        )
      THEN
        v_allowed := array_append(v_allowed, v_app.app_id);
      END IF;
    END IF;
  END LOOP;

  RETURN v_allowed;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."allowed_read_apps"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."allowed_read_apps"() TO "authenticated";

-- 3) Apply fail-fast + index-friendly policies on the largest affected tables.

-- audit_logs: keep org_id predicate but add a one-time guard so unauthenticated anon requests do not scan.
DROP POLICY IF EXISTS "Allow select for auth, api keys (super_admin+)" ON "public"."audit_logs";
CREATE POLICY "Allow select for auth, api keys (super_admin+)" ON "public"."audit_logs"
FOR SELECT TO "anon", "authenticated"
USING (
  public.has_auth_or_valid_apikey('{read,upload,write,all}'::public.key_mode[])
  AND "org_id" = ANY("public"."audit_logs_allowed_orgs"())
);

-- app_versions + app_versions_meta: avoid per-row identity resolution; use allowed_read_apps().
DROP POLICY IF EXISTS "Allow for auth, api keys (read+)" ON "public"."app_versions";
CREATE POLICY "Allow for auth, api keys (read+)" ON "public"."app_versions"
FOR SELECT TO "anon", "authenticated"
USING (
  public.has_auth_or_valid_apikey('{read,upload,write,all}'::public.key_mode[])
  AND "app_id" = ANY("public"."allowed_read_apps"())
);

DROP POLICY IF EXISTS "Allow read for auth (read+)" ON "public"."app_versions_meta";
CREATE POLICY "Allow read for auth (read+)" ON "public"."app_versions_meta"
FOR SELECT TO "anon", "authenticated"
USING (
  public.has_auth_or_valid_apikey('{read,upload,write,all}'::public.key_mode[])
  AND "app_id" = ANY("public"."allowed_read_apps"())
);

-- 4) (Optional hardening) Replace common read policies to avoid per-row get_identity_org_appid() on large tables.
-- apps
DROP POLICY IF EXISTS "Allow for auth, api keys (read+)" ON "public"."apps";
CREATE POLICY "Allow for auth, api keys (read+)" ON "public"."apps"
FOR SELECT TO "anon", "authenticated"
USING (
  public.has_auth_or_valid_apikey('{read,upload,write,all}'::public.key_mode[])
  AND "app_id" = ANY("public"."allowed_read_apps"())
);

-- channels
DROP POLICY IF EXISTS "Allow select for auth, api keys (read+)" ON "public"."channels";
CREATE POLICY "Allow select for auth, api keys (read+)" ON "public"."channels"
FOR SELECT TO "anon", "authenticated"
USING (
  public.has_auth_or_valid_apikey('{read,upload,write,all}'::public.key_mode[])
  AND "app_id" = ANY("public"."allowed_read_apps"())
);

-- channel_devices
DROP POLICY IF EXISTS "Allow read for auth, api keys (read+)" ON "public"."channel_devices";
DROP POLICY IF EXISTS "Allow read for auth (read+)" ON "public"."channel_devices";
CREATE POLICY "Allow read for auth, api keys (read+)" ON "public"."channel_devices"
FOR SELECT TO "anon", "authenticated"
USING (
  public.has_auth_or_valid_apikey('{read,upload,write,all}'::public.key_mode[])
  AND "app_id" = ANY("public"."allowed_read_apps"())
);

-- build_requests
DROP POLICY IF EXISTS "Allow org members to select build_requests" ON "public"."build_requests";
CREATE POLICY "Allow org members to select build_requests" ON "public"."build_requests"
FOR SELECT TO "anon", "authenticated"
USING (
  public.has_auth_or_valid_apikey('{read,upload,write,all}'::public.key_mode[])
  AND "app_id" = ANY("public"."allowed_read_apps"())
);
