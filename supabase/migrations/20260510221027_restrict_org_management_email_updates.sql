CREATE OR REPLACE FUNCTION "public"."prevent_org_management_email_non_super_admin_update"()
RETURNS trigger
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_request_user uuid;
BEGIN
  IF NEW.management_email IS NOT DISTINCT FROM OLD.management_email THEN
    RETURN NEW;
  END IF;

  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  v_request_user := public.get_identity_org_allowed('{all,write}'::public.key_mode[], OLD.id);

  IF v_request_user IS NULL OR NOT public.check_min_rights(
    'super_admin'::public.user_min_right,
    v_request_user,
    OLD.id,
    NULL::character varying,
    NULL::bigint
  ) THEN
    RAISE EXCEPTION 'Only organization super admins can update the management email'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."prevent_org_management_email_non_super_admin_update"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."prevent_org_management_email_non_super_admin_update"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."prevent_org_management_email_non_super_admin_update"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."prevent_org_management_email_non_super_admin_update"() FROM "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_org_management_email_non_super_admin_update"() TO "service_role";

DROP TRIGGER IF EXISTS "prevent_org_management_email_non_super_admin_update" ON "public"."orgs";
CREATE TRIGGER "prevent_org_management_email_non_super_admin_update"
BEFORE UPDATE OF "management_email" ON "public"."orgs"
FOR EACH ROW
EXECUTE FUNCTION "public"."prevent_org_management_email_non_super_admin_update"();
