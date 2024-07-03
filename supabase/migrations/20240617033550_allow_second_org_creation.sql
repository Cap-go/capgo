CREATE POLICY "Allow webapp to insert" ON public.orgs FOR INSERT TO authenticated WITH CHECK (
  (( SELECT auth.uid() AS uid) = created_by)
);

ALTER TABLE "public"."orgs"
ADD CONSTRAINT "unique_name_created_by" UNIQUE ("name", "created_by");


CREATE OR REPLACE FUNCTION "public"."generate_org_on_user_create"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  org_record record;
BEGIN
    -- Add management_email compared to old fn
    INSERT INTO orgs (created_by, name, management_email) values (NEW.id, format('%s organization', NEW.first_name), NEW.email) RETURNING * into org_record;
    -- we no longer insert into org_users here. There is a new trigger on "orgs"
    -- INSERT INTO org_users (user_id, org_id, user_right) values (NEW.id, org_record.id, 'super_admin'::"user_min_right");

    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION "public"."generate_org_user_on_org_create"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  org_record record;
BEGIN
    INSERT INTO org_users (user_id, org_id, user_right) values (NEW.created_by, NEW.id, 'super_admin'::"user_min_right");
    RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER "generate_org_user_on_org_create" 
AFTER INSERT ON  "public"."orgs" 
FOR EACH ROW EXECUTE FUNCTION "public"."generate_org_user_on_org_create"();
