-- Fix Supabase linter warning: channel_permission_overrides had two permissive
-- SELECT paths for authenticated because the write policy used FOR ALL.
-- Split write access into INSERT / UPDATE / DELETE so SELECT remains a single
-- policy and query planning stays cheaper.

DROP POLICY IF EXISTS channel_permission_overrides_admin_write
ON public.channel_permission_overrides;

CREATE POLICY channel_permission_overrides_admin_insert
ON public.channel_permission_overrides
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.channels
        INNER JOIN public.apps ON public.channels.app_id = public.apps.app_id
        WHERE
            public.channels.id = channel_permission_overrides.channel_id
            AND public.rbac_check_permission(
                public.rbac_perm_app_update_user_roles(),
                public.apps.owner_org,
                public.apps.app_id,
                NULL::bigint
            )
    )
);

CREATE POLICY channel_permission_overrides_admin_update
ON public.channel_permission_overrides
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.channels
        INNER JOIN public.apps ON public.channels.app_id = public.apps.app_id
        WHERE
            public.channels.id = channel_permission_overrides.channel_id
            AND public.rbac_check_permission(
                public.rbac_perm_app_update_user_roles(),
                public.apps.owner_org,
                public.apps.app_id,
                NULL::bigint
            )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.channels
        INNER JOIN public.apps ON public.channels.app_id = public.apps.app_id
        WHERE
            public.channels.id = channel_permission_overrides.channel_id
            AND public.rbac_check_permission(
                public.rbac_perm_app_update_user_roles(),
                public.apps.owner_org,
                public.apps.app_id,
                NULL::bigint
            )
    )
);

CREATE POLICY channel_permission_overrides_admin_delete
ON public.channel_permission_overrides
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.channels
        INNER JOIN public.apps ON public.channels.app_id = public.apps.app_id
        WHERE
            public.channels.id = channel_permission_overrides.channel_id
            AND public.rbac_check_permission(
                public.rbac_perm_app_update_user_roles(),
                public.apps.owner_org,
                public.apps.app_id,
                NULL::bigint
            )
    )
);

COMMENT ON POLICY channel_permission_overrides_admin_select
ON public.channel_permission_overrides IS
'Authenticated app admins can read channel permission overrides. Single SELECT policy to avoid multiple permissive policies.';

COMMENT ON POLICY channel_permission_overrides_admin_insert
ON public.channel_permission_overrides IS
'Authenticated app admins can insert channel permission overrides.';

COMMENT ON POLICY channel_permission_overrides_admin_update
ON public.channel_permission_overrides IS
'Authenticated app admins can update channel permission overrides.';

COMMENT ON POLICY channel_permission_overrides_admin_delete
ON public.channel_permission_overrides IS
'Authenticated app admins can delete channel permission overrides.';
