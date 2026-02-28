-- Add a trigger to prevent deleting the last org super_admin role binding
-- This protects against direct PostgREST DELETEs that bypass the SQL function guards

CREATE OR REPLACE FUNCTION "public"."prevent_last_super_admin_binding_delete"()
RETURNS TRIGGER
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_remaining_count integer;
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

DROP TRIGGER IF EXISTS "prevent_last_super_admin_delete" ON "public"."role_bindings";

CREATE TRIGGER "prevent_last_super_admin_delete"
  BEFORE DELETE ON "public"."role_bindings"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."prevent_last_super_admin_binding_delete"();
