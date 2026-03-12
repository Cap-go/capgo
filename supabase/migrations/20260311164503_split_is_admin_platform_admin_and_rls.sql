-- Define platform admin detection as the single canonical platform-admin helper
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

REVOKE ALL ON FUNCTION public.is_platform_admin(userid uuid) FROM public;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM public;
GRANT ALL ON FUNCTION public.is_platform_admin(userid uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_platform_admin() TO service_role;

COMMENT ON FUNCTION public.is_platform_admin(
    uuid
) IS 'Checks if a user is platform admin from admin_users secret. Always requires MFA.';

-- ---------------------------------------------------------------------------
-- RLS migration:
-- Remove legacy policy-level admin checks by rewriting them to literal false.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_policy RECORD;
  v_roles TEXT;
  v_using TEXT;
  v_with_check TEXT;
  v_roles_sql TEXT;
  v_cmd TEXT;
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

    v_using := replace(v_using, 'public.is_admin(auth_user.uid)', 'false');
    v_using := replace(v_using, 'public.is_admin(auth.uid())', 'false');
    v_using := replace(v_using, '"public"."is_admin"("auth_user"."uid")', 'false');
    v_using := replace(v_using, 'public.is_admin((SELECT auth.uid()))', 'false');
    v_using := replace(v_using, '"public"."is_admin"((SELECT auth.uid()))', 'false');
    v_using := replace(v_using, 'is_admin(auth_user.uid)', 'false');
    v_using := replace(v_using, 'is_admin(auth.uid())', 'false');
    v_using := replace(v_using, 'is_admin((SELECT auth.uid()))', 'false');

    v_with_check := replace(v_with_check, 'public.is_admin(auth_user.uid)', 'false');
    v_with_check := replace(v_with_check, 'public.is_admin(auth.uid())', 'false');
    v_with_check := replace(v_with_check, '"public"."is_admin"("auth_user"."uid")', 'false');
    v_with_check := replace(v_with_check, 'public.is_admin((SELECT auth.uid()))', 'false');
    v_with_check := replace(v_with_check, '"public"."is_admin"((SELECT auth.uid()))', 'false');
    v_with_check := replace(v_with_check, 'is_admin(auth_user.uid)', 'false');
    v_with_check := replace(v_with_check, 'is_admin(auth.uid())', 'false');
    v_with_check := replace(v_with_check, 'is_admin((SELECT auth.uid()))', 'false');

    IF v_using = v_policy.qual AND v_with_check = COALESCE(v_policy.with_check, '') THEN
      CONTINUE;
    END IF;

    IF array_length(v_policy.roles, 1) > 0 THEN
      SELECT string_agg(format('%I', policy_role), ', ')
      INTO v_roles
      FROM unnest(v_policy.roles) AS x(policy_role);
      v_roles_sql := format(' TO %s', v_roles);
    END IF;

    v_using := NULLIF(BTRIM(v_using), '');
    v_with_check := NULLIF(BTRIM(v_with_check), '');

    IF v_using IS NULL THEN
      v_using := 'true';
    END IF;

    IF v_policy.with_check IS NOT NULL AND v_with_check IS NULL THEN
      v_with_check := 'true';
    END IF;

    IF v_policy.cmd = 'INSERT' THEN
      IF v_with_check IS NULL THEN
        v_with_check := 'true';
      END IF;
      v_cmd := format(
        'ALTER POLICY %I ON %I.%I',
        v_policy.policyname,
        v_policy.schemaname,
        v_policy.tablename
      );
      v_cmd := v_cmd || v_roles_sql || format(' WITH CHECK (%s)', v_with_check);
    ELSIF v_policy.with_check IS NOT NULL AND v_policy.cmd IN ('UPDATE', 'ALL') THEN
      v_cmd := format(
        'ALTER POLICY %I ON %I.%I',
        v_policy.policyname,
        v_policy.schemaname,
        v_policy.tablename
      );
      v_cmd := v_cmd || v_roles_sql || format(' USING (%s) WITH CHECK (%s)', v_using, v_with_check);
    ELSIF v_policy.cmd = 'SELECT' OR v_policy.cmd = 'DELETE' OR v_policy.cmd = 'UPDATE' THEN
      IF v_using IS NULL THEN
        v_using := 'true';
      END IF;
      v_cmd := format(
        'ALTER POLICY %I ON %I.%I',
        v_policy.policyname,
        v_policy.schemaname,
        v_policy.tablename
      );
      v_cmd := v_cmd || v_roles_sql || format(' USING (%s)', v_using);
    ELSE
      v_cmd := format(
        'ALTER POLICY %I ON %I.%I',
        v_policy.policyname,
        v_policy.schemaname,
        v_policy.tablename
      );
      v_cmd := v_cmd || v_roles_sql || format(' USING (%s)', v_using);
    END IF;

    EXECUTE v_cmd;
  END LOOP;
END
$$;

DROP FUNCTION IF EXISTS public.is_admin(userid uuid);
DROP FUNCTION IF EXISTS public.is_admin();
