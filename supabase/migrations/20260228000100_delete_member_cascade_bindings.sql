-- Fix delete_org_member_role to cascade all bindings (org, app, channel)
-- Previously only deleted the org-level binding, leaving orphaned app/channel bindings

CREATE OR REPLACE FUNCTION "public"."delete_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_org_created_by uuid;
BEGIN
  -- Check if user has permission to update roles
  IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_update_user_roles(), auth.uid(), p_org_id, NULL, NULL) THEN
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
      AND rb.principal_type = public.rbac_principal_user()
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id = p_org_id
      AND r.name = public.rbac_role_org_super_admin()
  ) THEN
    IF (
      SELECT COUNT(*)
      FROM public.role_bindings rb
      INNER JOIN public.roles r ON rb.role_id = r.id
      WHERE rb.scope_type = public.rbac_scope_org()
        AND rb.org_id = p_org_id
        AND rb.principal_type = public.rbac_principal_user()
        AND r.name = public.rbac_role_org_super_admin()
    ) <= 1 THEN
      RAISE EXCEPTION 'CANNOT_REMOVE_LAST_SUPER_ADMIN';
    END IF;
  END IF;

  -- Delete ALL role bindings for this user in this org (org, app, and channel scopes)
  -- to prevent orphaned app/channel bindings after org-level removal
  DELETE FROM public.role_bindings
  WHERE principal_id = p_user_id
    AND principal_type = public.rbac_principal_user()
    AND org_id = p_org_id;

  RETURN 'OK';
END;
$$;

COMMENT ON FUNCTION "public"."delete_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid") IS 'Deletes all of an organization member''s role bindings (org, app, and channel scopes). Requires org.update_user_roles permission. Returns OK on success.';
