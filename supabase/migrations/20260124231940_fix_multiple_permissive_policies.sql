-- =============================================================================
-- Fix Multiple Permissive Policies
-- =============================================================================
-- This migration fixes the Supabase linter warning about multiple permissive
-- policies for the same role and action on several tables.
--
-- The issue: Using FOR ALL creates policies that cover SELECT, INSERT, UPDATE,
-- DELETE. When combined with a separate FOR SELECT policy, this creates
-- duplicate SELECT policies which is suboptimal for performance.
--
-- The fix: Replace FOR ALL with separate FOR INSERT, FOR UPDATE, FOR DELETE
-- policies, keeping only one FOR SELECT policy per table that combines all
-- read conditions.
--
-- Performance: All policies call auth.uid() only once using a subquery pattern
-- as per AGENTS.md guidelines.
-- =============================================================================

-- =============================================================================
-- 1. FIX rbac_settings: Combine SELECT, split write policies
-- =============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS rbac_settings_read_authenticated ON public.rbac_settings;
DROP POLICY IF EXISTS rbac_settings_admin_all ON public.rbac_settings;

-- Single SELECT policy (admins and authenticated users can read)
CREATE POLICY rbac_settings_select ON public.rbac_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- Separate write policies for admin only (single auth.uid() call each)
CREATE POLICY rbac_settings_insert ON public.rbac_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.is_admin(auth_user.uid)
    )
  );

CREATE POLICY rbac_settings_update ON public.rbac_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.is_admin(auth_user.uid)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.is_admin(auth_user.uid)
    )
  );

CREATE POLICY rbac_settings_delete ON public.rbac_settings
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.is_admin(auth_user.uid)
    )
  );

-- =============================================================================
-- 2. FIX roles: Combine SELECT, split write policies
-- =============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS roles_read_all ON public.roles;
DROP POLICY IF EXISTS roles_admin_write ON public.roles;

-- Single SELECT policy
CREATE POLICY roles_select ON public.roles
  FOR SELECT
  TO authenticated
  USING (true);

-- Separate write policies for admin only
CREATE POLICY roles_insert ON public.roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.is_admin(auth_user.uid)
    )
  );

CREATE POLICY roles_update ON public.roles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.is_admin(auth_user.uid)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.is_admin(auth_user.uid)
    )
  );

CREATE POLICY roles_delete ON public.roles
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.is_admin(auth_user.uid)
    )
  );

-- =============================================================================
-- 3. FIX permissions: Combine SELECT, split write policies
-- =============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS permissions_read_all ON public.permissions;
DROP POLICY IF EXISTS permissions_admin_write ON public.permissions;

-- Single SELECT policy
CREATE POLICY permissions_select ON public.permissions
  FOR SELECT
  TO authenticated
  USING (true);

-- Separate write policies for admin only
CREATE POLICY permissions_insert ON public.permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.is_admin(auth_user.uid)
    )
  );

CREATE POLICY permissions_update ON public.permissions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.is_admin(auth_user.uid)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.is_admin(auth_user.uid)
    )
  );

CREATE POLICY permissions_delete ON public.permissions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.is_admin(auth_user.uid)
    )
  );

-- =============================================================================
-- 4. FIX role_permissions: Combine SELECT, split write policies
-- =============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS role_permissions_read_all ON public.role_permissions;
DROP POLICY IF EXISTS role_permissions_admin_write ON public.role_permissions;

-- Single SELECT policy
CREATE POLICY role_permissions_select ON public.role_permissions
  FOR SELECT
  TO authenticated
  USING (true);

-- Separate write policies for admin only
CREATE POLICY role_permissions_insert ON public.role_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.is_admin(auth_user.uid)
    )
  );

CREATE POLICY role_permissions_update ON public.role_permissions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.is_admin(auth_user.uid)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.is_admin(auth_user.uid)
    )
  );

CREATE POLICY role_permissions_delete ON public.role_permissions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.is_admin(auth_user.uid)
    )
  );

-- =============================================================================
-- 5. FIX role_hierarchy: Combine SELECT, split write policies
-- =============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS role_hierarchy_read_all ON public.role_hierarchy;
DROP POLICY IF EXISTS role_hierarchy_admin_write ON public.role_hierarchy;

-- Single SELECT policy
CREATE POLICY role_hierarchy_select ON public.role_hierarchy
  FOR SELECT
  TO authenticated
  USING (true);

-- Separate write policies for admin only
CREATE POLICY role_hierarchy_insert ON public.role_hierarchy
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.is_admin(auth_user.uid)
    )
  );

CREATE POLICY role_hierarchy_update ON public.role_hierarchy
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.is_admin(auth_user.uid)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.is_admin(auth_user.uid)
    )
  );

CREATE POLICY role_hierarchy_delete ON public.role_hierarchy
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.is_admin(auth_user.uid)
    )
  );

-- =============================================================================
-- 6. FIX groups: Combine SELECT, split write policies
-- =============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS groups_read_org_member ON public.groups;
DROP POLICY IF EXISTS groups_write_org_admin ON public.groups;

-- Single SELECT policy (org members OR admins can read) - single auth.uid() call
CREATE POLICY groups_select ON public.groups
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE EXISTS (
        SELECT 1 FROM public.org_users
        WHERE org_users.org_id = groups.org_id
          AND org_users.user_id = auth_user.uid
      )
      OR public.is_admin(auth_user.uid)
    )
  );

-- Separate write policies for org admin - single auth.uid() call each
CREATE POLICY groups_insert ON public.groups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth_user.uid, org_id, NULL::varchar, NULL::bigint)
         OR public.is_admin(auth_user.uid)
    )
  );

CREATE POLICY groups_update ON public.groups
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth_user.uid, org_id, NULL::varchar, NULL::bigint)
         OR public.is_admin(auth_user.uid)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth_user.uid, org_id, NULL::varchar, NULL::bigint)
         OR public.is_admin(auth_user.uid)
    )
  );

CREATE POLICY groups_delete ON public.groups
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth_user.uid, org_id, NULL::varchar, NULL::bigint)
         OR public.is_admin(auth_user.uid)
    )
  );

-- =============================================================================
-- 7. FIX group_members: Combine SELECT, split write policies
-- =============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS group_members_read_org_member ON public.group_members;
DROP POLICY IF EXISTS group_members_write_org_admin ON public.group_members;

-- Single SELECT policy (org members OR admins can read) - single auth.uid() call
CREATE POLICY group_members_select ON public.group_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE EXISTS (
        SELECT 1 FROM public.groups
        JOIN public.org_users ON org_users.org_id = groups.org_id
        WHERE groups.id = group_members.group_id
          AND org_users.user_id = auth_user.uid
      )
      OR public.is_admin(auth_user.uid)
    )
  );

-- Separate write policies for org admin - single auth.uid() call each
CREATE POLICY group_members_insert ON public.group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE EXISTS (
        SELECT 1 FROM public.groups
        WHERE groups.id = group_members.group_id
          AND (
            public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth_user.uid, groups.org_id, NULL::varchar, NULL::bigint)
            OR public.is_admin(auth_user.uid)
          )
      )
    )
  );

CREATE POLICY group_members_update ON public.group_members
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE EXISTS (
        SELECT 1 FROM public.groups
        WHERE groups.id = group_members.group_id
          AND (
            public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth_user.uid, groups.org_id, NULL::varchar, NULL::bigint)
            OR public.is_admin(auth_user.uid)
          )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE EXISTS (
        SELECT 1 FROM public.groups
        WHERE groups.id = group_members.group_id
          AND (
            public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth_user.uid, groups.org_id, NULL::varchar, NULL::bigint)
            OR public.is_admin(auth_user.uid)
          )
      )
    )
  );

CREATE POLICY group_members_delete ON public.group_members
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE EXISTS (
        SELECT 1 FROM public.groups
        WHERE groups.id = group_members.group_id
          AND (
            public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth_user.uid, groups.org_id, NULL::varchar, NULL::bigint)
            OR public.is_admin(auth_user.uid)
          )
      )
    )
  );

-- =============================================================================
-- 8. FIX role_bindings: Consolidate SELECT and DELETE policies
-- =============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Allow viewing role bindings with permission" ON public.role_bindings;
DROP POLICY IF EXISTS role_bindings_write_scope_admin ON public.role_bindings;
DROP POLICY IF EXISTS "Allow admins to delete manageable role bindings" ON public.role_bindings;

-- Single SELECT policy combining all read conditions - single auth.uid() call
CREATE POLICY role_bindings_select ON public.role_bindings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE
        -- Platform admin sees all
        public.is_admin(auth_user.uid)
        OR
        -- Org admins can see all bindings in their org
        public.is_user_org_admin(auth_user.uid, role_bindings.org_id)
        OR
        -- App admins can see app-scoped bindings
        (role_bindings.scope_type = public.rbac_scope_app() AND public.is_user_app_admin(auth_user.uid, role_bindings.app_id))
        OR
        -- Users with a role in the app can see app-scoped bindings
        (role_bindings.scope_type = public.rbac_scope_app() AND role_bindings.app_id IS NOT NULL AND public.user_has_role_in_app(auth_user.uid, role_bindings.app_id))
        OR
        -- Channel-scope bindings: visible to app admins of the parent app
        (role_bindings.scope_type = public.rbac_scope_channel() AND role_bindings.channel_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.channels c
          JOIN public.apps a ON a.app_id = c.app_id
          WHERE c.rbac_id = role_bindings.channel_id
            AND public.is_user_app_admin(auth_user.uid, a.id)
        ))
    )
  );

-- INSERT policy - single auth.uid() call
CREATE POLICY role_bindings_insert ON public.role_bindings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE
        public.is_admin(auth_user.uid)
        OR
        (scope_type = public.rbac_scope_platform() AND public.is_admin(auth_user.uid))
        OR
        (scope_type = public.rbac_scope_org() AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth_user.uid, org_id, NULL::varchar, NULL::bigint))
        OR
        (scope_type = public.rbac_scope_app() AND EXISTS (
          SELECT 1 FROM public.apps
          WHERE apps.id = role_bindings.app_id
            AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth_user.uid, apps.owner_org, apps.app_id, NULL::bigint)
        ))
        OR
        (scope_type = public.rbac_scope_channel() AND EXISTS (
          SELECT 1 FROM public.channels
          JOIN public.apps ON apps.app_id = channels.app_id
          WHERE channels.rbac_id = role_bindings.channel_id
            AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth_user.uid, apps.owner_org, channels.app_id, channels.id)
        ))
    )
  );

-- UPDATE policy - single auth.uid() call
CREATE POLICY role_bindings_update ON public.role_bindings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE
        public.is_admin(auth_user.uid)
        OR
        (scope_type = public.rbac_scope_platform() AND public.is_admin(auth_user.uid))
        OR
        (scope_type = public.rbac_scope_org() AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth_user.uid, org_id, NULL::varchar, NULL::bigint))
        OR
        (scope_type = public.rbac_scope_app() AND EXISTS (
          SELECT 1 FROM public.apps
          WHERE apps.id = role_bindings.app_id
            AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth_user.uid, apps.owner_org, apps.app_id, NULL::bigint)
        ))
        OR
        (scope_type = public.rbac_scope_channel() AND EXISTS (
          SELECT 1 FROM public.channels
          JOIN public.apps ON apps.app_id = channels.app_id
          WHERE channels.rbac_id = role_bindings.channel_id
            AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth_user.uid, apps.owner_org, channels.app_id, channels.id)
        ))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE
        public.is_admin(auth_user.uid)
        OR
        (scope_type = public.rbac_scope_platform() AND public.is_admin(auth_user.uid))
        OR
        (scope_type = public.rbac_scope_org() AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth_user.uid, org_id, NULL::varchar, NULL::bigint))
        OR
        (scope_type = public.rbac_scope_app() AND EXISTS (
          SELECT 1 FROM public.apps
          WHERE apps.id = role_bindings.app_id
            AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth_user.uid, apps.owner_org, apps.app_id, NULL::bigint)
        ))
        OR
        (scope_type = public.rbac_scope_channel() AND EXISTS (
          SELECT 1 FROM public.channels
          JOIN public.apps ON apps.app_id = channels.app_id
          WHERE channels.rbac_id = role_bindings.channel_id
            AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth_user.uid, apps.owner_org, channels.app_id, channels.id)
        ))
    )
  );

-- Single DELETE policy combining all delete conditions - single auth.uid() call
CREATE POLICY role_bindings_delete ON public.role_bindings
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE
        -- Platform admin
        public.is_admin(auth_user.uid)
        OR
        -- Org admin for org-scoped bindings
        (scope_type = public.rbac_scope_org() AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth_user.uid, org_id, NULL::varchar, NULL::bigint))
        OR
        -- App admin for app-scoped bindings
        (scope_type = public.rbac_scope_app() AND EXISTS (
          SELECT 1 FROM public.apps
          WHERE apps.id = role_bindings.app_id
            AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth_user.uid, apps.owner_org, apps.app_id, NULL::bigint)
        ))
        OR
        -- Channel admin for channel-scoped bindings
        (scope_type = public.rbac_scope_channel() AND EXISTS (
          SELECT 1 FROM public.channels
          JOIN public.apps ON apps.app_id = channels.app_id
          WHERE channels.rbac_id = role_bindings.channel_id
            AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth_user.uid, apps.owner_org, channels.app_id, channels.id)
        ))
        OR
        -- Users with app.update_user_roles permission can delete app-scoped bindings
        (scope_type = public.rbac_scope_app() AND public.user_has_app_update_user_roles(auth_user.uid, app_id))
        OR
        -- Users can delete their own app-scoped bindings
        (scope_type = public.rbac_scope_app() AND principal_type = public.rbac_principal_user() AND principal_id = auth_user.uid)
    )
  );

-- =============================================================================
-- Add comments for documentation
-- =============================================================================

COMMENT ON POLICY rbac_settings_select ON public.rbac_settings IS
  'All authenticated users can read RBAC settings. Single SELECT policy to avoid multiple permissive policies.';
COMMENT ON POLICY rbac_settings_insert ON public.rbac_settings IS
  'Only platform admins can insert RBAC settings.';
COMMENT ON POLICY rbac_settings_update ON public.rbac_settings IS
  'Only platform admins can update RBAC settings.';
COMMENT ON POLICY rbac_settings_delete ON public.rbac_settings IS
  'Only platform admins can delete RBAC settings.';

COMMENT ON POLICY roles_select ON public.roles IS
  'All authenticated users can read roles. Single SELECT policy to avoid multiple permissive policies.';
COMMENT ON POLICY roles_insert ON public.roles IS
  'Only platform admins can insert roles.';
COMMENT ON POLICY roles_update ON public.roles IS
  'Only platform admins can update roles.';
COMMENT ON POLICY roles_delete ON public.roles IS
  'Only platform admins can delete roles.';

COMMENT ON POLICY permissions_select ON public.permissions IS
  'All authenticated users can read permissions. Single SELECT policy to avoid multiple permissive policies.';
COMMENT ON POLICY permissions_insert ON public.permissions IS
  'Only platform admins can insert permissions.';
COMMENT ON POLICY permissions_update ON public.permissions IS
  'Only platform admins can update permissions.';
COMMENT ON POLICY permissions_delete ON public.permissions IS
  'Only platform admins can delete permissions.';

COMMENT ON POLICY role_permissions_select ON public.role_permissions IS
  'All authenticated users can read role_permissions. Single SELECT policy to avoid multiple permissive policies.';
COMMENT ON POLICY role_permissions_insert ON public.role_permissions IS
  'Only platform admins can insert role_permissions.';
COMMENT ON POLICY role_permissions_update ON public.role_permissions IS
  'Only platform admins can update role_permissions.';
COMMENT ON POLICY role_permissions_delete ON public.role_permissions IS
  'Only platform admins can delete role_permissions.';

COMMENT ON POLICY role_hierarchy_select ON public.role_hierarchy IS
  'All authenticated users can read role_hierarchy. Single SELECT policy to avoid multiple permissive policies.';
COMMENT ON POLICY role_hierarchy_insert ON public.role_hierarchy IS
  'Only platform admins can insert role_hierarchy.';
COMMENT ON POLICY role_hierarchy_update ON public.role_hierarchy IS
  'Only platform admins can update role_hierarchy.';
COMMENT ON POLICY role_hierarchy_delete ON public.role_hierarchy IS
  'Only platform admins can delete role_hierarchy.';

COMMENT ON POLICY groups_select ON public.groups IS
  'Org members and platform admins can read groups. Single SELECT policy with single auth.uid() call.';
COMMENT ON POLICY groups_insert ON public.groups IS
  'Org admins and platform admins can insert groups.';
COMMENT ON POLICY groups_update ON public.groups IS
  'Org admins and platform admins can update groups.';
COMMENT ON POLICY groups_delete ON public.groups IS
  'Org admins and platform admins can delete groups.';

COMMENT ON POLICY group_members_select ON public.group_members IS
  'Org members and platform admins can read group_members. Single SELECT policy with single auth.uid() call.';
COMMENT ON POLICY group_members_insert ON public.group_members IS
  'Org admins and platform admins can insert group_members.';
COMMENT ON POLICY group_members_update ON public.group_members IS
  'Org admins and platform admins can update group_members.';
COMMENT ON POLICY group_members_delete ON public.group_members IS
  'Org admins and platform admins can delete group_members.';

COMMENT ON POLICY role_bindings_select ON public.role_bindings IS
  'Consolidated SELECT policy for role_bindings. Visible to platform admins, org admins, app admins, and users with roles. Single auth.uid() call for performance.';
COMMENT ON POLICY role_bindings_insert ON public.role_bindings IS
  'Scope admins can insert role_bindings within their scope.';
COMMENT ON POLICY role_bindings_update ON public.role_bindings IS
  'Scope admins can update role_bindings within their scope.';
COMMENT ON POLICY role_bindings_delete ON public.role_bindings IS
  'Consolidated DELETE policy for role_bindings. Scope admins, users with update_user_roles permission, and users deleting their own bindings. Single auth.uid() call for performance.';
