-- =============================================================================
-- Fix RBAC Performance and Security Issues
-- =============================================================================
-- This migration addresses:
-- 1. Security: Add search_path to is_user_app_admin and is_user_org_admin
-- 2. Performance: Use (SELECT auth.uid()) pattern in RLS policies to avoid
--    multiple auth.uid() evaluations per row
-- 3. Multiple Permissive Policies: Remove duplicate SELECT policies on role_bindings
-- 4. Security: Restrict function access - only authenticated users should access
--    RBAC helper functions, not anon/public
-- =============================================================================

-- =============================================================================
-- 1. FIX SECURITY: Add search_path to functions
-- =============================================================================

-- Fix is_user_org_admin - add search_path for security
CREATE OR REPLACE FUNCTION public.is_user_org_admin(p_user_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    INNER JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = p_user_id
      AND rb.org_id = p_org_id
      AND rb.scope_type = public.rbac_scope_org()
      AND r.name IN (public.rbac_role_platform_super_admin(), public.rbac_role_org_super_admin(), public.rbac_role_org_admin())
  );
$$;

COMMENT ON FUNCTION public.is_user_org_admin(uuid, uuid) IS
  'Checks whether a user has an admin role in an organization (bypasses RLS to avoid recursion).';

-- Fix is_user_app_admin - add search_path for security
CREATE OR REPLACE FUNCTION public.is_user_app_admin(p_user_id uuid, p_app_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    INNER JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = p_user_id
      AND rb.app_id = p_app_id
      AND rb.scope_type = public.rbac_scope_app()
      AND r.name IN (public.rbac_role_app_admin(), public.rbac_role_org_super_admin(), public.rbac_role_org_admin(), public.rbac_role_platform_super_admin())
  );
$$;

COMMENT ON FUNCTION public.is_user_app_admin(uuid, uuid) IS
  'Checks whether a user has an admin role for an app (bypasses RLS to avoid recursion).';

-- =============================================================================
-- 2. RESTRICT FUNCTION ACCESS: Only authenticated users, not anon/public
-- =============================================================================

-- Restrict is_user_org_admin
REVOKE ALL ON FUNCTION public.is_user_org_admin(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_user_org_admin(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_user_org_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_org_admin(uuid, uuid) TO service_role;

-- Restrict is_user_app_admin
REVOKE ALL ON FUNCTION public.is_user_app_admin(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_user_app_admin(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_user_app_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_app_admin(uuid, uuid) TO service_role;

-- =============================================================================
-- 3. FIX MULTIPLE PERMISSIVE POLICIES: Remove duplicate SELECT on role_bindings
-- =============================================================================

-- Drop the older, less optimized policy
DROP POLICY IF EXISTS role_bindings_read_scope_member ON public.role_bindings;

-- The "Allow viewing role bindings with permission" policy already covers this with better logic
-- We'll recreate it with optimized auth.uid() pattern

DROP POLICY IF EXISTS "Allow viewing role bindings with permission" ON public.role_bindings;

CREATE POLICY "Allow viewing role bindings with permission"
ON public.role_bindings
FOR SELECT
TO authenticated
USING (
  -- Use (SELECT auth.uid()) to evaluate once per query, not per row
  public.is_user_org_admin((SELECT auth.uid()), org_id)
  OR
  (scope_type = public.rbac_scope_app() AND public.is_user_app_admin((SELECT auth.uid()), app_id))
  OR
  (scope_type = public.rbac_scope_app() AND app_id IS NOT NULL AND public.user_has_role_in_app((SELECT auth.uid()), app_id))
);

COMMENT ON POLICY "Allow viewing role bindings with permission" ON public.role_bindings IS
  'Allows viewing role bindings if the user is admin or has a role in the app. Optimized with (SELECT auth.uid()) pattern.';

-- =============================================================================
-- 4. FIX PERFORMANCE: Optimize RLS policies with (SELECT auth.uid()) pattern
-- =============================================================================

-- Fix rbac_settings policies
DROP POLICY IF EXISTS rbac_settings_read_authenticated ON public.rbac_settings;
DROP POLICY IF EXISTS rbac_settings_admin_all ON public.rbac_settings;

CREATE POLICY rbac_settings_read_authenticated ON public.rbac_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY rbac_settings_admin_all ON public.rbac_settings
  FOR ALL
  TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));

-- Fix roles policies
DROP POLICY IF EXISTS roles_admin_write ON public.roles;

CREATE POLICY roles_admin_write ON public.roles
  FOR ALL
  TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));

-- Fix permissions policies
DROP POLICY IF EXISTS permissions_admin_write ON public.permissions;

CREATE POLICY permissions_admin_write ON public.permissions
  FOR ALL
  TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));

-- Fix role_permissions policies
DROP POLICY IF EXISTS role_permissions_admin_write ON public.role_permissions;

CREATE POLICY role_permissions_admin_write ON public.role_permissions
  FOR ALL
  TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));

-- Fix role_hierarchy policies
DROP POLICY IF EXISTS role_hierarchy_admin_write ON public.role_hierarchy;

CREATE POLICY role_hierarchy_admin_write ON public.role_hierarchy
  FOR ALL
  TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));

-- Fix groups policies
DROP POLICY IF EXISTS groups_read_org_member ON public.groups;
DROP POLICY IF EXISTS groups_write_org_admin ON public.groups;

CREATE POLICY groups_read_org_member ON public.groups
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_users
      WHERE org_users.org_id = groups.org_id
        AND org_users.user_id = (SELECT auth.uid())
    )
    OR
    public.is_admin((SELECT auth.uid()))
  );

CREATE POLICY groups_write_org_admin ON public.groups
  FOR ALL
  TO authenticated
  USING (
    public.check_min_rights(public.rbac_right_admin()::public.user_min_right, (SELECT auth.uid()), org_id, NULL::varchar, NULL::bigint)
    OR
    public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    public.check_min_rights(public.rbac_right_admin()::public.user_min_right, (SELECT auth.uid()), org_id, NULL::varchar, NULL::bigint)
    OR
    public.is_admin((SELECT auth.uid()))
  );

-- Fix group_members policies
DROP POLICY IF EXISTS group_members_read_org_member ON public.group_members;
DROP POLICY IF EXISTS group_members_write_org_admin ON public.group_members;

CREATE POLICY group_members_read_org_member ON public.group_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.groups
      JOIN public.org_users ON org_users.org_id = groups.org_id
      WHERE groups.id = group_members.group_id
        AND org_users.user_id = (SELECT auth.uid())
    )
    OR
    public.is_admin((SELECT auth.uid()))
  );

CREATE POLICY group_members_write_org_admin ON public.group_members
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.groups
      WHERE groups.id = group_members.group_id
        AND (
          public.check_min_rights(public.rbac_right_admin()::public.user_min_right, (SELECT auth.uid()), groups.org_id, NULL::varchar, NULL::bigint)
          OR public.is_admin((SELECT auth.uid()))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.groups
      WHERE groups.id = group_members.group_id
        AND (
          public.check_min_rights(public.rbac_right_admin()::public.user_min_right, (SELECT auth.uid()), groups.org_id, NULL::varchar, NULL::bigint)
          OR public.is_admin((SELECT auth.uid()))
        )
    )
  );

-- Fix role_bindings write policy
DROP POLICY IF EXISTS role_bindings_write_scope_admin ON public.role_bindings;

CREATE POLICY role_bindings_write_scope_admin ON public.role_bindings
  FOR ALL
  TO authenticated
  USING (
    (scope_type = public.rbac_scope_platform() AND public.is_admin((SELECT auth.uid())))
    OR
    (scope_type = public.rbac_scope_org() AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, (SELECT auth.uid()), org_id, NULL::varchar, NULL::bigint))
    OR
    (scope_type = public.rbac_scope_app() AND EXISTS (
      SELECT 1 FROM public.apps
      WHERE apps.id = role_bindings.app_id
        AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, (SELECT auth.uid()), apps.owner_org, apps.app_id, NULL::bigint)
    ))
    OR
    (scope_type = public.rbac_scope_channel() AND EXISTS (
      SELECT 1 FROM public.channels
      JOIN public.apps ON apps.app_id = channels.app_id
      WHERE channels.rbac_id = role_bindings.channel_id
        AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, (SELECT auth.uid()), apps.owner_org, apps.app_id, NULL::bigint)
    ))
    OR
    public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    (scope_type = public.rbac_scope_platform() AND public.is_admin((SELECT auth.uid())))
    OR
    (scope_type = public.rbac_scope_org() AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, (SELECT auth.uid()), org_id, NULL::varchar, NULL::bigint))
    OR
    (scope_type = public.rbac_scope_app() AND EXISTS (
      SELECT 1 FROM public.apps
      WHERE apps.id = role_bindings.app_id
        AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, (SELECT auth.uid()), apps.owner_org, apps.app_id, NULL::bigint)
    ))
    OR
    (scope_type = public.rbac_scope_channel() AND EXISTS (
      SELECT 1 FROM public.channels
      JOIN public.apps ON apps.app_id = channels.app_id
      WHERE channels.rbac_id = role_bindings.channel_id
        AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, (SELECT auth.uid()), apps.owner_org, apps.app_id, NULL::bigint)
    ))
    OR
    public.is_admin((SELECT auth.uid()))
  );

-- Fix role_bindings delete policy
DROP POLICY IF EXISTS "Allow admins to delete manageable role bindings" ON public.role_bindings;

CREATE POLICY "Allow admins to delete manageable role bindings"
ON public.role_bindings
FOR DELETE
TO authenticated
USING (
  (scope_type = public.rbac_scope_app() AND public.user_has_app_update_user_roles((SELECT auth.uid()), app_id))
  OR
  (scope_type = public.rbac_scope_app() AND principal_type = public.rbac_principal_user() AND principal_id = (SELECT auth.uid()))
);

COMMENT ON POLICY "Allow admins to delete manageable role bindings" ON public.role_bindings IS
  'Allows users with app.update_user_roles permission and the user themselves to delete role bindings. Optimized with (SELECT auth.uid()) pattern.';

-- =============================================================================
-- 5. FIX user_has_role_in_app: Use (SELECT auth.uid()) pattern
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_has_role_in_app(p_user_id uuid, p_app_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_org_id uuid;
BEGIN
  -- Use SELECT to evaluate auth.uid() once
  SELECT auth.uid() INTO v_caller_id;

  IF v_caller_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_caller_id <> p_user_id THEN
    SELECT owner_org INTO v_org_id
    FROM public.apps
    WHERE id = p_app_id
    LIMIT 1;

    IF v_org_id IS NULL THEN
      RETURN false;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.role_bindings rb
      WHERE rb.principal_type = public.rbac_principal_user()
        AND rb.principal_id = v_caller_id
        AND (rb.org_id = v_org_id OR rb.app_id = p_app_id)
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = p_user_id
      AND rb.app_id = p_app_id
      AND rb.scope_type = public.rbac_scope_app()
  );
END;
$$;

COMMENT ON FUNCTION public.user_has_role_in_app(uuid, uuid) IS
  'Checks whether a user has a role in an app (bypasses RLS to avoid recursion). Optimized with SELECT auth.uid() pattern.';

-- =============================================================================
-- 6. FIX user_has_app_update_user_roles: Use (SELECT auth.uid()) pattern
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_has_app_update_user_roles(p_user_id uuid, p_app_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_app_id_varchar text;
  v_org_id uuid;
  v_caller_id uuid;
BEGIN
  -- Use SELECT to evaluate auth.uid() once
  SELECT auth.uid() INTO v_caller_id;

  IF v_caller_id IS NULL THEN
    RETURN false;
  END IF;

  -- Fetch app_id varchar and org_id from apps table
  SELECT app_id, owner_org INTO v_app_id_varchar, v_org_id
  FROM public.apps
  WHERE id = p_app_id
  LIMIT 1;

  IF v_app_id_varchar IS NULL OR v_org_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_caller_id <> p_user_id THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.role_bindings rb
      WHERE rb.principal_type = public.rbac_principal_user()
        AND rb.principal_id = v_caller_id
        AND (rb.org_id = v_org_id OR rb.app_id = p_app_id)
    ) THEN
      RETURN false;
    END IF;
  END IF;

  -- Use rbac_has_permission to check the permission
  RETURN public.rbac_has_permission(
    public.rbac_principal_user(),
    p_user_id,
    public.rbac_perm_app_update_user_roles(),
    v_org_id,
    v_app_id_varchar,
    NULL
  );
END;
$$;

COMMENT ON FUNCTION public.user_has_app_update_user_roles(uuid, uuid) IS
  'Checks whether a user has app.update_user_roles permission (bypasses RLS to avoid recursion). Optimized with SELECT auth.uid() pattern.';

-- =============================================================================
-- 7. RESTRICT ADMIN-ONLY RBAC FUNCTIONS: Prevent access from anon/public
-- =============================================================================
-- These functions are used for RBAC migration and administration.
-- They should ONLY be callable by service_role (admin) or authenticated users
-- with platform admin rights. By default, functions are public, so we must
-- explicitly restrict them.

-- Restrict rbac_migrate_org_users_to_bindings - admin migration function
REVOKE ALL ON FUNCTION public.rbac_migrate_org_users_to_bindings(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rbac_migrate_org_users_to_bindings(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rbac_migrate_org_users_to_bindings(uuid, uuid) TO service_role;

-- Restrict rbac_enable_for_org - admin migration function
REVOKE ALL ON FUNCTION public.rbac_enable_for_org(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rbac_enable_for_org(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rbac_enable_for_org(uuid, uuid) TO service_role;

-- Restrict rbac_preview_migration - admin preview function
REVOKE ALL ON FUNCTION public.rbac_preview_migration(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rbac_preview_migration(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rbac_preview_migration(uuid) TO service_role;

-- Restrict rbac_rollback_org - admin rollback function
REVOKE ALL ON FUNCTION public.rbac_rollback_org(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rbac_rollback_org(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rbac_rollback_org(uuid) TO service_role;

-- Restrict rbac_has_permission - should only be used by authenticated users
-- and service_role (not anon/apikey access without auth)
REVOKE ALL ON FUNCTION public.rbac_has_permission(text, uuid, text, uuid, character varying, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rbac_has_permission(text, uuid, text, uuid, character varying, bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.rbac_has_permission(text, uuid, text, uuid, character varying, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_has_permission(text, uuid, text, uuid, character varying, bigint) TO service_role;

-- Restrict rbac_is_enabled_for_org - helper function
REVOKE ALL ON FUNCTION public.rbac_is_enabled_for_org(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rbac_is_enabled_for_org(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rbac_is_enabled_for_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_is_enabled_for_org(uuid) TO service_role;

-- Restrict rbac_permission_for_legacy - internal helper
REVOKE ALL ON FUNCTION public.rbac_permission_for_legacy(public.user_min_right, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rbac_permission_for_legacy(public.user_min_right, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rbac_permission_for_legacy(public.user_min_right, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_permission_for_legacy(public.user_min_right, text) TO service_role;

-- Restrict rbac_legacy_role_hint - internal helper
REVOKE ALL ON FUNCTION public.rbac_legacy_role_hint(public.user_min_right, character varying, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rbac_legacy_role_hint(public.user_min_right, character varying, bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.rbac_legacy_role_hint(public.user_min_right, character varying, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_legacy_role_hint(public.user_min_right, character varying, bigint) TO service_role;
