-- Align group visibility policies with RBAC permission checks instead of legacy admin rights.

DROP POLICY IF EXISTS groups_select ON public.groups;

CREATE POLICY groups_select ON public.groups
FOR SELECT
TO authenticated
USING (
    public.is_current_user_group_member(groups.id)
    OR public.rbac_check_permission_request(
        public.rbac_perm_org_update_user_roles(),
        groups.org_id,
        NULL::character varying,
        NULL::bigint
    )
);

DROP POLICY IF EXISTS group_members_select ON public.group_members;

CREATE POLICY group_members_select ON public.group_members
FOR SELECT
TO authenticated
USING (
    public.is_current_user_group_member(group_members.group_id)
    OR EXISTS (
        SELECT 1
        FROM public.groups g
        WHERE g.id = group_members.group_id
          AND public.rbac_check_permission_request(
            public.rbac_perm_org_update_user_roles(),
            g.org_id,
            NULL::character varying,
            NULL::bigint
          )
    )
);
