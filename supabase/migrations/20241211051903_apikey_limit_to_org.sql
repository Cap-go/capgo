-- ALTER TABLE apikeys
-- ADD COLUMN limited_to_orgs UUID[] DEFAULT '{}';

CREATE OR REPLACE FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    user_right_record RECORD;
    api_key_text text;
    api_key record;
BEGIN
    IF user_id = NULL THEN
        RETURN false;
    END IF;

    SELECT (("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text") into api_key_text;

    -- No api key found in headers, return
    IF api_key_text IS DISTINCT FROM NULL THEN
        SELECT * FROM apikeys WHERE key = api_key_text INTO api_key;
        IF api_key.limited_to_orgs IS DISTINCT FROM '{}' THEN
            IF NOT (org_id = ANY(api_key.limited_to_orgs)) THEN
                RETURN false;
            END IF;
        END IF;
    END IF;

    FOR user_right_record IN 
        SELECT org_users.user_right, org_users.app_id, org_users.channel_id 
        FROM org_users 
        WHERE org_users.org_id = check_min_rights.org_id AND org_users.user_id = check_min_rights.user_id
    LOOP
        IF (user_right_record.user_right >= min_right AND user_right_record.app_id IS NULL AND user_right_record.channel_id IS NULL) OR
           (user_right_record.user_right >= min_right AND user_right_record.app_id = check_min_rights.app_id AND user_right_record.channel_id IS NULL) OR
           (user_right_record.user_right >= min_right AND user_right_record.app_id = check_min_rights.app_id AND user_right_record.channel_id = check_min_rights.channel_id)
        THEN
            RETURN true;
        END IF;
    END LOOP;

    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."has_app_right_apikey"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid", "apikey" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE 
  org_id uuid;
  api_key record;
Begin
  org_id := get_user_main_org_id_by_app_id(appid);

  SELECT * FROM apikeys WHERE key = apikey INTO api_key;
  IF api_key.limited_to_orgs IS DISTINCT FROM '{}' THEN
      IF NOT (org_id = ANY(api_key.limited_to_orgs)) THEN
          RETURN false;
      END IF;
  END IF;

  RETURN (is_owner_of_org(userid, org_id) OR check_min_rights("right", userid, org_id, "appid", NULL::bigint));
End;
$$;

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

  if NOT (check_min_rights('admin'::user_min_right, (select "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[])), invite_user_to_org.org_id, NULL::character varying, NULL::bigint)) THEN
    return 'NO_RIGHTS';
  END IF;


  if NOT (check_min_rights('super_admin'::user_min_right, (select "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[])), invite_user_to_org.org_id, NULL::character varying, NULL::bigint) AND (invite_type is distinct from 'super_admin'::"public"."user_min_right" or invite_type is distinct from 'invite_super_admin'::"public"."user_min_right")) THEN
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