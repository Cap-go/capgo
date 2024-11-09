DROP POLICY IF EXISTS "Allow org owner to all" ON "public"."org_users";

CREATE OR REPLACE FUNCTION "public"."check_org_user_privilages"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$BEGIN
  IF (select current_user) IS NOT DISTINCT FROM 'postgres' THEN
    RETURN NEW;
  END IF;
  
  IF ("public"."check_min_rights"('super_admin'::"public"."user_min_right", (select auth.uid()), NEW.org_id, NULL::character varying, NULL::bigint))
  THEN
    RETURN NEW;
  END IF;

  IF NEW.user_right IS NOT DISTINCT FROM 'super_admin'::"public"."user_min_right"
  THEN
    RAISE EXCEPTION 'Admins cannot elevate privilages!';
  END IF;

  IF NEW.user_right IS NOT DISTINCT FROM 'invite_super_admin'::"public"."user_min_right"
  THEN
    RAISE EXCEPTION 'Admins cannot elevate privilages!';
  END IF;

  RETURN NEW;
END;$$;

ALTER FUNCTION "public"."check_org_user_privilages"() OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."check_org_user_privilages"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_org_user_privilages"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_org_user_privilages"() TO "service_role";

CREATE OR REPLACE TRIGGER "check_privilages" BEFORE INSERT OR UPDATE ON "public"."org_users" FOR EACH ROW EXECUTE FUNCTION "public"."check_org_user_privilages"();

CREATE OR REPLACE FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Declare  
  org record;
  invited_user record;
  current_record record;
Begin
  SELECT * FROM ORGS
  INTO org
  WHERE orgs.id=invite_user_to_org.org_id;

  IF org IS NULL THEN
    return 'NO_ORG';
  END IF;

  if NOT (check_min_rights('admin'::user_min_right, (select auth.uid()), invite_user_to_org.org_id, NULL::character varying, NULL::bigint)) THEN
    return 'NO_RIGHTS';
  END IF;


  if NOT (check_min_rights('super_admin'::user_min_right, (select auth.uid()), invite_user_to_org.org_id, NULL::character varying, NULL::bigint) AND (invite_type is not distinct from 'super_admin'::"public"."user_min_right" or invite_type is not distinct from 'invite_super_admin'::"public"."user_min_right")) THEN
    return 'NO_RIGHTS';
  END IF;

  SELECT users.id FROM USERS
  INTO invited_user
  WHERE users.email=invite_user_to_org.email;

  IF invited_user IS NOT NULL THEN
    -- INSERT INTO org_users (user_id, org_id, user_right)
    -- VALUES (invited_user.id, invite_user_to_org.org_id, invite_type);

    IF (org.created_by=invited_user.id) THEN
      RETURN 'CAN_NOT_INVITE_OWNER';
    END IF;

    SELECT org_users.id from org_users 
    INTO current_record
    WHERE org_users.user_id=invited_user.id
    AND org_users.org_id=invite_user_to_org.org_id;

    IF current_record IS NOT NULL THEN
      RETURN 'ALREADY_INVITED';
    ELSE
      INSERT INTO org_users (user_id, org_id, user_right)
      VALUES (invited_user.id, invite_user_to_org.org_id, invite_type);

      RETURN 'OK';
    END IF;
  ELSE
    return 'NO_EMAIL';
  END IF;
End;
$$;