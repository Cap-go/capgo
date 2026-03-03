-- Fix RBAC test compatibility: enforce last super_admin protection trigger for all roles
-- The trigger prevents deletion of the last org-level super_admin binding to protect org access.
-- SERVICE_ROLE IS NOT EXEMPT: All roles (including service_role) must respect this guard.

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

  -- Serialize operations on this org's super_admin bindings using advisory lock
  -- This prevents write-skew anomalies under concurrent deletes without FOR UPDATE deadlocks
  PERFORM pg_advisory_xact_lock(hashtext(OLD.org_id::text));

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
