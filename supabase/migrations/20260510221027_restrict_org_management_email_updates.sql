DROP TRIGGER IF EXISTS "prevent_org_management_email_non_super_admin_update" ON "public"."orgs";
DROP TRIGGER IF EXISTS "prevent_org_management_email_direct_update" ON "public"."orgs";
DROP FUNCTION IF EXISTS "public"."prevent_org_management_email_non_super_admin_update"();

CREATE OR REPLACE FUNCTION "public"."prevent_org_management_email_direct_update"()
RETURNS trigger
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
BEGIN
  IF NEW.management_email IS NOT DISTINCT FROM OLD.management_email THEN
    RETURN NEW;
  END IF;

  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Management email updates must use the organization email sync endpoint'
    USING ERRCODE = '42501';

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."prevent_org_management_email_direct_update"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."prevent_org_management_email_direct_update"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."prevent_org_management_email_direct_update"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."prevent_org_management_email_direct_update"() FROM "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_org_management_email_direct_update"() TO "service_role";

CREATE TRIGGER "prevent_org_management_email_direct_update"
BEFORE UPDATE OF "management_email" ON "public"."orgs"
FOR EACH ROW
EXECUTE FUNCTION "public"."prevent_org_management_email_direct_update"();
