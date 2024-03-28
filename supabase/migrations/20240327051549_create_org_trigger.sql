CREATE OR REPLACE FUNCTION generate_org_on_user_create() RETURNS TRIGGER AS $_$
DECLARE
  org_record record;
BEGIN
    INSERT INTO orgs (created_by, name) values (NEW.id, format('%s organization', NEW.first_name)) RETURNING * into org_record;
    INSERT INTO org_users (user_id, org_id, user_right) values (NEW.id, org_record.id, 'super_admin'::"user_min_right");

    RETURN NEW;
END $_$ LANGUAGE 'plpgsql';


CREATE TRIGGER generate_org_on_user_create
   AFTER INSERT OR UPDATE ON "public"."users" FOR EACH ROW
   EXECUTE PROCEDURE "public"."generate_org_on_user_create"();  