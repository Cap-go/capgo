-- Fix horizontal privilege escalation on groups and group_members.
-- Org members who are not in a group must not read group metadata or membership lists.

CREATE OR REPLACE FUNCTION public.is_current_user_group_member(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = (SELECT auth.uid())
  );
$$;

ALTER FUNCTION public.is_current_user_group_member(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_current_user_group_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_group_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_group_member(uuid) TO service_role;

COMMENT ON FUNCTION public.is_current_user_group_member(uuid) IS
  'RLS helper: true when auth.uid() belongs to the given group. SECURITY DEFINER to avoid group_members policy recursion.';

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
