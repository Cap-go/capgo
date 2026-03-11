-- Replace RLS policy admin checks to avoid `is_admin` usage at policy-level.
-- `is_admin` is retained for legacy/internal callers; RLS now uses `is_platform_admin()`.

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
