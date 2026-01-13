-- Function to delete an org member's role with RBAC constraints
CREATE OR REPLACE FUNCTION "public"."delete_org_member_role"(
  p_org_id uuid,
  p_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_binding_id uuid;
  v_org_created_by uuid;
BEGIN
  -- Check if user has permission to update roles
  IF NOT public.rbac_check_permission_direct('org.update_user_roles', auth.uid(), p_org_id, NULL, NULL) THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
  END IF;

  -- Get org owner to prevent removing the last super admin
  SELECT created_by INTO v_org_created_by
  FROM public.orgs
  WHERE id = p_org_id;

  -- Prevent removing the org owner
  IF p_user_id = v_org_created_by THEN
    RAISE EXCEPTION 'CANNOT_CHANGE_OWNER_ROLE';
  END IF;

  -- Check if removing a super_admin and if this is the last super_admin
  IF EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    INNER JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_id = p_user_id
      AND rb.principal_type = 'user'
      AND rb.scope_type = 'org'
      AND rb.org_id = p_org_id
      AND r.name = 'org_super_admin'
  ) THEN
    -- Count super admins in this org
    IF (
      SELECT COUNT(*)
      FROM public.role_bindings rb
      INNER JOIN public.roles r ON rb.role_id = r.id
      WHERE rb.scope_type = 'org'
        AND rb.org_id = p_org_id
        AND rb.principal_type = 'user'
        AND r.name = 'org_super_admin'
    ) <= 1 THEN
      RAISE EXCEPTION 'CANNOT_REMOVE_LAST_SUPER_ADMIN';
    END IF;
  END IF;

  -- Find existing role binding for this user at org level
  SELECT rb.id INTO v_existing_binding_id
  FROM public.role_bindings rb
  INNER JOIN public.roles r ON rb.role_id = r.id
  WHERE rb.principal_id = p_user_id
    AND rb.principal_type = 'user'
    AND rb.scope_type = 'org'
    AND rb.org_id = p_org_id
    AND r.scope_type = 'org'
  LIMIT 1;

  -- Delete existing org-level role binding if it exists
  IF v_existing_binding_id IS NOT NULL THEN
    DELETE FROM public.role_bindings
    WHERE id = v_existing_binding_id;
  END IF;

  RETURN 'OK';
END;
$$;

ALTER FUNCTION "public"."delete_org_member_role"(uuid, uuid) OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."delete_org_member_role"(uuid, uuid) TO "authenticated";

COMMENT ON FUNCTION "public"."delete_org_member_role"(uuid, uuid) IS
  'Deletes an organization member''s role. Requires org.update_user_roles permission. Returns OK on success.';
