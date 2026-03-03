-- Fix prevent_last_super_admin_binding_delete trigger to allow CASCADE deletions
-- When an org is being deleted, all its role_bindings are deleted via CASCADE.
-- The trigger should not block this - only prevent direct deletes of the last super_admin.

CREATE OR REPLACE FUNCTION "public"."prevent_last_super_admin_binding_delete"()
RETURNS TRIGGER
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_remaining_count integer;
  v_org_exists boolean;
BEGIN
  -- Only check org-level super_admin bindings
  IF OLD.scope_type != public.rbac_scope_org() THEN
    RETURN OLD;
  END IF;

  -- Only check if the deleted binding is a super_admin role
  IF NOT EXISTS (
    SELECT 1 FROM public.roles r
    WHERE r.id = OLD.role_id
      AND r.name = public.rbac_role_org_super_admin()
  ) THEN
    RETURN OLD;
  END IF;

  -- Allow deletion if the org itself is being deleted (CASCADE scenario)
  SELECT EXISTS(
    SELECT 1 FROM public.orgs WHERE id = OLD.org_id
  ) INTO v_org_exists;

  IF NOT v_org_exists THEN
    RETURN OLD;
  END IF;

  -- Lock all super_admin bindings in this org to prevent write-skew under concurrent deletes
  PERFORM 1
  FROM public.role_bindings rb
  INNER JOIN public.roles r ON rb.role_id = r.id
  WHERE rb.scope_type = public.rbac_scope_org()
    AND rb.org_id = OLD.org_id
    AND rb.principal_type = public.rbac_principal_user()
    AND r.name = public.rbac_role_org_super_admin()
  FOR UPDATE;

  -- Count remaining super_admin bindings in this org (excluding the one being deleted)
  SELECT COUNT(*) INTO v_remaining_count
  FROM public.role_bindings rb
  INNER JOIN public.roles r ON rb.role_id = r.id
  WHERE rb.scope_type = public.rbac_scope_org()
    AND rb.org_id = OLD.org_id
    AND rb.principal_type = public.rbac_principal_user()
    AND r.name = public.rbac_role_org_super_admin()
    AND rb.id != OLD.id;

  IF v_remaining_count < 1 THEN
    RAISE EXCEPTION 'CANNOT_DELETE_LAST_SUPER_ADMIN_BINDING'
      USING HINT = 'At least one super_admin binding must remain in the org';
  END IF;

  RETURN OLD;
END;
$$;
