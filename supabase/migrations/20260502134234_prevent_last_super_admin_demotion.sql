-- Prevent role updates from bypassing the last org super_admin guard.
-- The existing delete trigger blocks deleting the final super_admin binding;
-- this companion trigger blocks demoting that final binding through role_id updates.

CREATE OR REPLACE FUNCTION "public"."prevent_last_super_admin_binding_update"()
RETURNS TRIGGER
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_remaining_count integer;
  v_org_exists boolean;
BEGIN
  IF OLD.role_id IS NOT DISTINCT FROM NEW.role_id THEN
    RETURN NEW;
  END IF;

  IF OLD.scope_type != public.rbac_scope_org() THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.roles r
    WHERE r.id = OLD.role_id
      AND r.name = public.rbac_role_org_super_admin()
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.roles r
    WHERE r.id = NEW.role_id
      AND r.name = public.rbac_role_org_super_admin()
  ) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.orgs
    WHERE id = OLD.org_id
  ) INTO v_org_exists;

  IF NOT v_org_exists THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(OLD.org_id::text));

  SELECT COUNT(*) INTO v_remaining_count
  FROM public.role_bindings rb
  INNER JOIN public.roles r ON rb.role_id = r.id
  WHERE rb.scope_type = public.rbac_scope_org()
    AND rb.org_id = OLD.org_id
    AND rb.principal_type = public.rbac_principal_user()
    AND r.name = public.rbac_role_org_super_admin()
    AND rb.id != OLD.id;

  IF v_remaining_count < 1 THEN
    RAISE EXCEPTION 'CANNOT_DEMOTE_LAST_SUPER_ADMIN_BINDING'
      USING HINT = 'At least one super_admin binding must remain in the org';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."prevent_last_super_admin_binding_update"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."prevent_last_super_admin_binding_update"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."prevent_last_super_admin_binding_update"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."prevent_last_super_admin_binding_update"() FROM "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_last_super_admin_binding_update"() TO "service_role";

DROP TRIGGER IF EXISTS "prevent_last_super_admin_update" ON "public"."role_bindings";
CREATE TRIGGER "prevent_last_super_admin_update"
  BEFORE UPDATE OF "role_id" ON "public"."role_bindings"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."prevent_last_super_admin_binding_update"();
