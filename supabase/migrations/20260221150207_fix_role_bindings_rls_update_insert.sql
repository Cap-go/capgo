-- Fix: Add user_has_app_update_user_roles to role_bindings INSERT and UPDATE policies
-- The DELETE policy already has this condition, but INSERT and UPDATE were missing it.
-- This caused silent failures when a user with app.update_user_roles permission
-- (but not legacy admin rights) tried to update or insert app-scoped role bindings
-- via the Supabase client (RLS path).
--
-- Also use get_identity_org_appid() for app-scoped branches so that API key holders
-- are correctly resolved, matching the pattern used by other app-scoped RLS policies.

-- =============================================================================
-- 1. Fix INSERT policy
-- =============================================================================
DROP POLICY IF EXISTS role_bindings_insert ON public.role_bindings;

CREATE POLICY role_bindings_insert ON public.role_bindings
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
        WHERE
        -- Platform admin
            public.is_admin(auth_user.uid)
            OR
            -- Org admin for org-scoped bindings
            (
                role_bindings.scope_type = public.rbac_scope_org()
                AND public.check_min_rights(
                    public.rbac_right_admin()::public.user_min_right,
                    auth_user.uid,
                    role_bindings.org_id,
                    NULL::varchar,
                    NULL::bigint
                )
            )
            OR
            -- App admin (legacy path) or users with app.update_user_roles permission
            (role_bindings.scope_type = public.rbac_scope_app() AND EXISTS (
                SELECT 1 FROM public.apps
                WHERE
                    apps.id = role_bindings.app_id
                    AND (
                        public.check_min_rights(
                            public.rbac_right_admin()::public.user_min_right,
                            public.get_identity_org_appid(
                                '{all}'::public.key_mode [],
                                apps.owner_org,
                                apps.app_id
                            ),
                            apps.owner_org,
                            apps.app_id,
                            NULL::bigint
                        )
                        OR
                        public.user_has_app_update_user_roles(
                            public.get_identity_org_appid(
                                '{all}'::public.key_mode [],
                                apps.owner_org,
                                apps.app_id
                            ),
                            apps.id
                        )
                    )
            ))
            OR
            -- Channel admin for channel-scoped bindings
            (role_bindings.scope_type = public.rbac_scope_channel() AND EXISTS (
                SELECT 1 FROM public.channels
                INNER JOIN public.apps ON channels.app_id = apps.app_id
                WHERE
                    channels.rbac_id = role_bindings.channel_id
                    AND public.check_min_rights(
                        public.rbac_right_admin()::public.user_min_right,
                        public.get_identity_org_appid(
                            '{all}'::public.key_mode [],
                            apps.owner_org,
                            apps.app_id
                        ),
                        apps.owner_org,
                        channels.app_id,
                        channels.id
                    )
            ))
    )
);

COMMENT ON POLICY role_bindings_insert ON public.role_bindings IS
'Scope admins and users with app.update_user_roles can insert role_bindings within their scope.';

-- =============================================================================
-- 2. Fix UPDATE policy
-- =============================================================================
DROP POLICY IF EXISTS role_bindings_update ON public.role_bindings;

CREATE POLICY role_bindings_update ON public.role_bindings
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM (SELECT auth.uid() AS uid) AS auth_user
        WHERE
        -- Platform admin
            public.is_admin(auth_user.uid)
            OR
            -- Org admin for org-scoped bindings
            (
                role_bindings.scope_type = public.rbac_scope_org()
                AND public.check_min_rights(
                    public.rbac_right_admin()::public.user_min_right,
                    auth_user.uid,
                    role_bindings.org_id,
                    NULL::varchar,
                    NULL::bigint
                )
            )
            OR
            -- App admin (legacy path) or users with app.update_user_roles permission
            (role_bindings.scope_type = public.rbac_scope_app() AND EXISTS (
                SELECT 1 FROM public.apps
                WHERE
                    apps.id = role_bindings.app_id
                    AND (
                        public.check_min_rights(
                            public.rbac_right_admin()::public.user_min_right,
                            public.get_identity_org_appid(
                                '{all}'::public.key_mode [],
                                apps.owner_org,
                                apps.app_id
                            ),
                            apps.owner_org,
                            apps.app_id,
                            NULL::bigint
                        )
                        OR
                        public.user_has_app_update_user_roles(
                            public.get_identity_org_appid(
                                '{all}'::public.key_mode [],
                                apps.owner_org,
                                apps.app_id
                            ),
                            apps.id
                        )
                    )
            ))
            OR
            -- Channel admin for channel-scoped bindings
            (role_bindings.scope_type = public.rbac_scope_channel() AND EXISTS (
                SELECT 1 FROM public.channels
                INNER JOIN public.apps ON channels.app_id = apps.app_id
                WHERE
                    channels.rbac_id = role_bindings.channel_id
                    AND public.check_min_rights(
                        public.rbac_right_admin()::public.user_min_right,
                        public.get_identity_org_appid(
                            '{all}'::public.key_mode [],
                            apps.owner_org,
                            apps.app_id
                        ),
                        apps.owner_org,
                        channels.app_id,
                        channels.id
                    )
            ))
    )
);

COMMENT ON POLICY role_bindings_update ON public.role_bindings IS
'Scope admins and users with app.update_user_roles can update role_bindings within their scope.';
