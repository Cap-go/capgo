-- EXECUTION MODEL (PostgREST RPC delete_org_member_role):
-- - Callers: authenticated console users via PostgREST RPC; at most once per member-removal action.
-- - Frequency: low-volume org admin UI traffic, not a hot path.
-- - Cardinality: one org row (orgs.pk on id), one successor lookup (role_bindings scoped by
--   org_id + principal_type + scope_type, roles.pk), optional super-admin count, then deletes
--   role_bindings for a single principal_id/org_id pair.
-- - Expected indexes: orgs(id), role_bindings(org_id, principal_type, scope_type, principal_id),
--   roles(id), roles(name).
CREATE OR REPLACE FUNCTION public.delete_org_member_role(
    p_org_id uuid,
    p_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id uuid;
    v_org_created_by uuid;
    v_successor_user_id uuid;
BEGIN
    v_actor_id := auth.uid();

    -- Check if user has permission to update roles.
    IF NOT public.rbac_check_permission_direct(
        public.rbac_perm_org_update_user_roles(),
        v_actor_id,
        p_org_id,
        NULL,
        NULL
    ) THEN
        RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
    END IF;

    -- Lock the org row so ownership transfer and member removal stay atomic.
    SELECT o.created_by INTO v_org_created_by
    FROM public.orgs AS o
    WHERE o.id = p_org_id
    FOR UPDATE;

    IF p_user_id = v_org_created_by THEN
        IF v_actor_id IS DISTINCT FROM p_user_id THEN
            RAISE EXCEPTION 'CANNOT_CHANGE_OWNER_ROLE';
        END IF;

        SELECT rb.principal_id INTO v_successor_user_id
        FROM public.role_bindings AS rb
        INNER JOIN public.roles AS r ON rb.role_id = r.id
        WHERE rb.principal_id <> p_user_id
            AND rb.principal_type = public.rbac_principal_user()
            AND rb.scope_type = public.rbac_scope_org()
            AND rb.org_id = p_org_id
            AND r.name = public.rbac_role_org_super_admin()
        ORDER BY rb.granted_at ASC NULLS LAST, rb.principal_id ASC
        LIMIT 1;

        IF v_successor_user_id IS NULL THEN
            RAISE EXCEPTION 'CANNOT_REMOVE_LAST_SUPER_ADMIN';
        END IF;

        UPDATE public.orgs AS o
        SET created_by = v_successor_user_id
        WHERE o.id = p_org_id;
    ELSE
        -- Check if removing a super_admin and if this is the last super_admin.
        IF EXISTS (
            SELECT 1
            FROM public.role_bindings AS rb
            INNER JOIN public.roles AS r ON rb.role_id = r.id
            WHERE rb.principal_id = p_user_id
                AND rb.principal_type = public.rbac_principal_user()
                AND rb.scope_type = public.rbac_scope_org()
                AND rb.org_id = p_org_id
                AND r.name = public.rbac_role_org_super_admin()
        ) THEN
            IF (
                SELECT COUNT(*)
                FROM public.role_bindings AS rb
                INNER JOIN public.roles AS r ON rb.role_id = r.id
                WHERE rb.scope_type = public.rbac_scope_org()
                    AND rb.org_id = p_org_id
                    AND rb.principal_type = public.rbac_principal_user()
                    AND r.name = public.rbac_role_org_super_admin()
            ) <= 1 THEN
                RAISE EXCEPTION 'CANNOT_REMOVE_LAST_SUPER_ADMIN';
            END IF;
        END IF;
    END IF;

    -- Delete ALL role bindings for this user in this org.
    DELETE FROM public.role_bindings AS rb
    WHERE rb.principal_id = p_user_id
        AND rb.principal_type = public.rbac_principal_user()
        AND rb.org_id = p_org_id;

    RETURN 'OK';
END;
$$;

ALTER FUNCTION public.delete_org_member_role(uuid, uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.delete_org_member_role(uuid, uuid) IS
'Deletes all organization member role bindings across org, app, and channel
scopes. Requires org.update_user_roles permission. Owners can only remove
themselves after another org_super_admin exists; ownership is transferred to
that successor before removal. Returns OK on success.';

REVOKE ALL ON FUNCTION public.delete_org_member_role(uuid, uuid) FROM public;
GRANT ALL ON FUNCTION public.delete_org_member_role(uuid, uuid)
TO authenticated;
GRANT ALL ON FUNCTION public.delete_org_member_role(uuid, uuid) TO service_role;
