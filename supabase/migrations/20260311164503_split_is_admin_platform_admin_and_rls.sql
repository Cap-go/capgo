-- Split platform admin detection from is_admin
CREATE OR REPLACE FUNCTION public.is_platform_admin(userid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  admin_ids_jsonb jsonb;
  is_platform_admin_from_secret boolean;
  mfa_verified boolean;
BEGIN
  SELECT public.verify_mfa() INTO mfa_verified;
  IF NOT mfa_verified THEN
    RETURN false;
  END IF;

  SELECT decrypted_secret::jsonb INTO admin_ids_jsonb
  FROM vault.decrypted_secrets
  WHERE name = 'admin_users';

  is_platform_admin_from_secret := COALESCE(admin_ids_jsonb ? userid::text, false);

  RETURN is_platform_admin_from_secret;
END;
$$;

ALTER FUNCTION public.is_platform_admin(userid uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.is_platform_admin((SELECT auth.uid()));
END;
$$;

ALTER FUNCTION public.is_platform_admin() OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.is_platform_admin(userid uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_platform_admin(userid uuid) TO "service_role";
GRANT ALL ON FUNCTION public.is_platform_admin() TO "authenticated";
GRANT ALL ON FUNCTION public.is_platform_admin() TO "service_role";

COMMENT ON FUNCTION public.is_platform_admin(uuid) IS 'Checks if a user is platform admin from admin_users secret. Always requires MFA.';

-- NOTE: is_admin() is kept for legacy/internal compatibility.
-- RLS no longer relies on is_admin(); platform-admin checks use is_platform_admin().
CREATE OR REPLACE FUNCTION public.is_admin(userid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  mfa_verified boolean;
  rbac_enabled boolean;
  is_admin_from_rbac boolean := false;
BEGIN
  SELECT public.verify_mfa() INTO mfa_verified;
  IF NOT mfa_verified THEN
    RETURN false;
  END IF;

  SELECT COALESCE(use_new_rbac, false) INTO rbac_enabled
  FROM public.rbac_settings
  WHERE id = 1;

  IF NOT rbac_enabled THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    JOIN public.roles r ON r.id = rb.role_id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = userid
      AND rb.scope_type = public.rbac_scope_platform()
      AND r.name = public.rbac_role_platform_super_admin()
  ) INTO is_admin_from_rbac;

  RETURN is_admin_from_rbac;
END;
$$;

COMMENT ON FUNCTION public.is_admin(uuid) IS 'Checks if a user is platform admin through RBAC only. Always requires MFA.';

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET
  search_path = ''
AS $$
BEGIN
  RETURN public.is_admin((SELECT auth.uid()));
END;
$$;

ALTER FUNCTION public.is_admin(userid uuid) OWNER TO "postgres";
ALTER FUNCTION public.is_admin() OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.is_admin(userid uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_admin(userid uuid) TO "service_role";
GRANT ALL ON FUNCTION public.is_admin() TO "authenticated";
GRANT ALL ON FUNCTION public.is_admin() TO "service_role";

COMMENT ON FUNCTION public.is_admin() IS 'Checks if the current user is platform admin through RBAC. Always requires MFA.';

-- ---------------------------------------------------------------------------
-- RLS migration:
-- Keep is_admin intact for legacy/internal callers, but do not use it in policy checks.
-- Replace any policy-level is_admin(auth.uid()) usages with is_platform_admin().
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_policy RECORD;
  v_roles TEXT;
  v_using TEXT;
  v_with_check TEXT;
  v_roles_sql TEXT;
BEGIN
  FOR v_policy IN
    SELECT *
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        qual LIKE '%is_admin%'
        OR with_check LIKE '%is_admin%'
      )
  LOOP
    v_using := COALESCE(v_policy.qual, '');
    v_with_check := COALESCE(v_policy.with_check, '');
    v_roles_sql := '';

    v_using := replace(v_using, 'public.is_admin(auth_user.uid)', 'public.is_platform_admin()');
    v_using := replace(v_using, 'public.is_admin(auth.uid())', 'public.is_platform_admin()');
    v_using := replace(v_using, '"public"."is_admin"("auth_user"."uid")', 'public.is_platform_admin()');
    v_using := replace(v_using, 'public.is_admin((SELECT auth.uid()))', 'public.is_platform_admin()');
    v_using := replace(v_using, '"public"."is_admin"((SELECT auth.uid()))', 'public.is_platform_admin()');
    v_using := replace(v_using, 'is_admin(auth_user.uid)', 'is_platform_admin()');
    v_using := replace(v_using, 'is_admin(auth.uid())', 'is_platform_admin()');
    v_using := replace(v_using, 'is_admin((SELECT auth.uid()))', 'is_platform_admin()');

    v_with_check := replace(v_with_check, 'public.is_admin(auth_user.uid)', 'public.is_platform_admin()');
    v_with_check := replace(v_with_check, 'public.is_admin(auth.uid())', 'public.is_platform_admin()');
    v_with_check := replace(v_with_check, '"public"."is_admin"("auth_user"."uid")', 'public.is_platform_admin()');
    v_with_check := replace(v_with_check, 'public.is_admin((SELECT auth.uid()))', 'public.is_platform_admin()');
    v_with_check := replace(v_with_check, '"public"."is_admin"((SELECT auth.uid()))', 'public.is_platform_admin()');
    v_with_check := replace(v_with_check, 'is_admin(auth_user.uid)', 'is_platform_admin()');
    v_with_check := replace(v_with_check, 'is_admin(auth.uid())', 'is_platform_admin()');
    v_with_check := replace(v_with_check, 'is_admin((SELECT auth.uid()))', 'is_platform_admin()');

    IF v_using = v_policy.qual AND v_with_check = COALESCE(v_policy.with_check, '') THEN
      CONTINUE;
    END IF;

    IF array_length(v_policy.roles, 1) > 0 THEN
      SELECT string_agg(format('%I', role), ', ')
      INTO v_roles
      FROM unnest(v_policy.roles) AS role;
      v_roles_sql := format(' TO %s', v_roles);
    END IF;

    IF v_policy.with_check IS NOT NULL THEN
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I%s USING (%s) WITH CHECK (%s)',
        v_policy.policyname,
        v_policy.schemaname,
        v_policy.tablename,
        v_roles_sql,
        v_with_check
      );
    ELSE
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I%s USING (%s)',
        v_policy.policyname,
        v_policy.schemaname,
        v_policy.tablename,
        v_roles_sql,
        v_using
      );
    END IF;
  END LOOP;
END
$$;
