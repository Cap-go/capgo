-- Create a new function to create a user if they don't exist during invitation
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

  if NOT (check_min_rights('admin'::user_min_right, (select "public"."get_identity_org_allowed"('{read,upload,write,all}'::"public"."key_mode"[], invite_user_to_org.org_id)), invite_user_to_org.org_id, NULL::character varying, NULL::bigint)) THEN
    return 'NO_RIGHTS';
  END IF;


  if NOT (check_min_rights('super_admin'::user_min_right, (select "public"."get_identity_org_allowed"('{read,upload,write,all}'::"public"."key_mode"[], invite_user_to_org.org_id)), invite_user_to_org.org_id, NULL::character varying, NULL::bigint) AND (invite_type is distinct from 'super_admin'::"public"."user_min_right" or invite_type is distinct from 'invite_super_admin'::"public"."user_min_right")) THEN
    return 'NO_RIGHTS';
  END IF;

  SELECT users.id FROM USERS
  INTO invited_user
  WHERE users.email=invite_user_to_org.email;

  IF invited_user IS NOT NULL THEN
    -- INSERT INTO org_users (user_id, org_id, user_right)
    -- VALUES (invited_user.id, invite_user_to_org.org_id, invite_type);

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
    -- Instead of returning 'NO_EMAIL', we'll return 'CREATE_USER' to indicate
    -- that the user needs to be created via the Supabase Admin SDK
    return 'CREATE_USER';
  END IF;
End;
$$;

-- Create a new function to add a user to an organization after they've been created
CREATE OR REPLACE FUNCTION "public"."add_user_to_org_after_creation"("user_id" "uuid", "org_id" "uuid", "invite_type" "public"."user_min_right") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Declare  
  current_record record;
Begin
  SELECT org_users.id from org_users 
  INTO current_record
  WHERE org_users.user_id=add_user_to_org_after_creation.user_id
  AND org_users.org_id=add_user_to_org_after_creation.org_id;

  IF current_record IS NOT NULL THEN
    RETURN 'ALREADY_INVITED';
  ELSE
    INSERT INTO org_users (user_id, org_id, user_right)
    VALUES (add_user_to_org_after_creation.user_id, add_user_to_org_after_creation.org_id, invite_type);

    RETURN 'OK';
  END IF;
End;
$$;
