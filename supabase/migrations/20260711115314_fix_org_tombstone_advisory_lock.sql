CREATE OR REPLACE FUNCTION "public"."lock_org_tombstone_guard"() RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Reuse the organization lifecycle lock shared by RBAC mutations. This avoids
  -- globally serializing unrelated org writes while making a same-id
  -- delete/recreate wait until the tombstone check sees the prior commit.
  IF TG_OP = 'INSERT' THEN
    PERFORM "public"."lock_rbac_orgs"(NEW."id");
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM "public"."lock_rbac_orgs"(OLD."id");
    RETURN OLD;
  END IF;

  -- The reuse guard rejects id changes, but take both locks in the shared
  -- canonical order before it runs so an attempted update cannot deadlock.
  PERFORM "public"."lock_rbac_orgs"(OLD."id", NEW."id");
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."lock_org_tombstone_guard"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."lock_org_tombstone_guard"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."lock_org_tombstone_guard"() TO "service_role";

DROP TRIGGER IF EXISTS "lock_org_tombstone_guard" ON "public"."orgs";
CREATE TRIGGER "lock_org_tombstone_guard"
  BEFORE INSERT OR DELETE OR UPDATE OF "id" ON "public"."orgs"
  FOR EACH ROW EXECUTE FUNCTION "public"."lock_org_tombstone_guard"();
