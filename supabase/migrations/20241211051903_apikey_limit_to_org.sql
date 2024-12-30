ALTER TABLE apikeys
ADD COLUMN limited_to_orgs UUID[] DEFAULT '{}';

CREATE OR REPLACE FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    user_right_record RECORD; 
BEGIN
    IF user_id = NULL THEN
        RETURN false;
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

  if NOT (check_min_rights('admin'::user_min_right, (select "public"."get_identity_org"('{read,upload,write,all}'::"public"."key_mode"[], invite_user_to_org.org_id)), invite_user_to_org.org_id, NULL::character varying, NULL::bigint)) THEN
    return 'NO_RIGHTS';
  END IF;


  if NOT (check_min_rights('super_admin'::user_min_right, (select "public"."get_identity_org"('{read,upload,write,all}'::"public"."key_mode"[], invite_user_to_org.org_id)), invite_user_to_org.org_id, NULL::character varying, NULL::bigint) AND (invite_type is distinct from 'super_admin'::"public"."user_min_right" or invite_type is distinct from 'invite_super_admin'::"public"."user_min_right")) THEN
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

CREATE OR REPLACE FUNCTION "public"."get_identity_org"("keymode" "public"."key_mode"[], "org_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    auth_uid uuid;
    api_key_text text;
    api_key record;
Begin
  SELECT auth.uid() into auth_uid;

  IF auth_uid IS NOT NULL THEN
    RETURN auth_uid;
  END IF;

  SELECT (("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text") into api_key_text;

  -- No api key found in headers, return
  IF api_key_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- Fetch the api key
  select * from apikeys 
  where key=api_key_text AND
  mode=ANY(keymode)
  limit 1 into api_key;

  if api_key IS DISTINCT FROM  NULL THEN
    IF api_key.limited_to_orgs IS DISTINCT FROM '{}' THEN
      IF NOT (org_id = ANY(api_key.limited_to_orgs)) THEN
          RETURN NULL;
      END IF;
    END IF;
    RETURN api_key.user_id;
  END IF;

  RETURN NULL;
End;
$$;

DROP POLICY "Allow insert for auth, api keys (write, all) (admin+)" ON "public"."channels";
CREATE POLICY "Allow insert for auth, api keys (write, all) (admin+)" ON "public"."channels" FOR INSERT TO "authenticated", "anon" WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org"('{write,all}'::"public"."key_mode"[], "owner_org"), "owner_org", "app_id", NULL::bigint));

DROP POLICY "Allow all for auth (admin+) (any apikey)" ON "public"."channels";
CREATE POLICY "Allow all for auth (admin+) (any apikey)" ON "public"."channels" TO "authenticated","anon" USING ("public"."check_min_rights"('admin'::"public"."user_min_right","public"."get_identity_org"('{read,upload,write,all}'::"public"."key_mode"[], "owner_org"),"owner_org","app_id",NULL::BIGINT)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right","public"."get_identity_org"('{read,upload,write,all}'::"public"."key_mode"[], "owner_org"),"owner_org","app_id",NULL::BIGINT));

DROP POLICY "Allow select for auth, api keys (read+)" ON "public"."channels";
CREATE POLICY "Allow select for auth, api keys (read+)" ON "public"."channels" FOR SELECT TO "authenticated", "anon" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity_org"('{read,upload,write,all}'::"public"."key_mode"[], "owner_org"), "owner_org", "app_id", NULL::bigint));

DROP POLICY "Allow update for auth, api keys (write, all, upload) (write+)" ON "public"."channels";
CREATE POLICY "Allow update for auth, api keys (write, all, upload) (write+)" ON "public"."channels" FOR UPDATE TO "authenticated", "anon" USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity_org"('{write,all,upload}'::"public"."key_mode"[], "owner_org"), "owner_org", "app_id", NULL::bigint)) WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity_org"('{write,all,upload}'::"public"."key_mode"[], "owner_org"), "owner_org", "app_id", NULL::bigint));

-- apps
DROP POLICY "Allow update for auth, api keys (write, all) (admin+)" ON "public"."apps";
CREATE POLICY "Allow update for auth, api keys (write, all) (admin+)" ON "public"."apps" FOR UPDATE TO "authenticated", "anon" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org"('{write,all}'::"public"."key_mode"[], "owner_org"), "owner_org", "app_id", NULL::bigint)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org"('{write,all}'::"public"."key_mode"[], "owner_org"), "owner_org", "app_id", NULL::bigint));

DROP POLICY "Allow for auth, api keys (read+)" ON "public"."apps";
CREATE POLICY "Allow for auth, api keys (read+)" ON "public"."apps" FOR SELECT TO "authenticated", "anon" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity_org"('{read,upload,write,all}'::"public"."key_mode"[], "owner_org"), "owner_org", "app_id", NULL::bigint));

DROP POLICY "Allow insert for apikey (write,all) (admin+)" ON "public"."apps";
CREATE POLICY "Allow insert for apikey (write,all) (admin+)" ON "public"."apps" FOR INSERT TO "anon" WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org"('{write,all}'::"public"."key_mode"[], "owner_org"), "owner_org", NULL::character varying, NULL::bigint));

-- app_versions
DROP POLICY "Allow for auth, api keys (read+)" ON "public"."app_versions";
CREATE POLICY "Allow for auth, api keys (read+)" ON "public"."app_versions" FOR SELECT TO "authenticated", "anon" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity_org"('{read,upload,write,all}'::"public"."key_mode"[], "owner_org"), "owner_org", "app_id", NULL::bigint));

DROP POLICY "Allow insert for api keys (write,all,upload) (upload+)" ON "public"."app_versions";
CREATE POLICY "Allow insert for api keys (write,all,upload) (upload+)" ON "public"."app_versions" FOR INSERT TO "anon" WITH CHECK ("public"."check_min_rights"('upload'::"public"."user_min_right", "public"."get_identity_org"('{write,all,upload}'::"public"."key_mode"[], "owner_org"), "owner_org", "app_id", NULL::bigint));

DROP POLICY "Allow update for api keys (write,all,upload) (upload+)" ON "public"."app_versions";
CREATE POLICY "Allow update for api keys (write,all,upload) (upload+)" ON "public"."app_versions" FOR UPDATE TO "anon" USING ("public"."check_min_rights"('upload'::"public"."user_min_right", "public"."get_identity_org"('{write,all,upload}'::"public"."key_mode"[], "owner_org"), "owner_org", "app_id", NULL::bigint)) WITH CHECK ("public"."check_min_rights"('upload'::"public"."user_min_right", "public"."get_identity_org"('{write,all,upload}'::"public"."key_mode"[], "owner_org"), "owner_org", "app_id", NULL::bigint));

DROP POLICY "Allow update for auth (write+)" ON "public"."app_versions";
CREATE POLICY "Allow update for auth (write+)" ON "public"."app_versions" FOR UPDATE TO "authenticated", "anon" USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity_org"('{write,all,upload}'::"public"."key_mode"[], "owner_org"), "owner_org", "app_id", NULL::bigint)) WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity_org"('{write,all,upload}'::"public"."key_mode"[], "owner_org"), "owner_org", "app_id", NULL::bigint));

-- app_versions_meta
DROP POLICY "Allow read for auth (read+)" ON "public"."app_versions_meta";
CREATE POLICY "Allow read for auth (read+)" ON "public"."app_versions_meta" FOR SELECT TO "authenticated", "anon" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity_org"('{read,upload,write,all}'::"public"."key_mode"[], "owner_org"), "owner_org", "app_id", NULL::bigint));

-- org_users
DROP POLICY "Allow to self delete" ON "public"."org_users";
CREATE POLICY "Allow to self delete" ON "public"."org_users" FOR DELETE TO "authenticated", "anon" USING (("user_id" = (select get_identity_org('{read,upload,write,all}'::"public"."key_mode"[], "org_id"))));

DROP POLICY "Allow memeber and owner to select" ON "public"."org_users";
CREATE POLICY "Allow memeber and owner to select" ON "public"."org_users" FOR SELECT TO "authenticated", "anon"  USING (("public"."is_member_of_org"((select get_identity_org('{read,upload,write,all}'::"public"."key_mode"[], "org_id")), "org_id") OR "public"."is_owner_of_org"((select get_identity_org('{read,upload,write,all}'::"public"."key_mode"[], "org_id")), "org_id")));

DROP POLICY "Allow org admin to all" ON "public"."org_users";
CREATE POLICY "Allow org admin to all" ON "public"."org_users" TO "authenticated", "anon"  USING ("public"."check_min_rights"('admin'::"public"."user_min_right", (select get_identity_org('{all}'::"public"."key_mode"[], "org_id")), "org_id", NULL::character varying, NULL::bigint)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", (select get_identity_org('{all}'::"public"."key_mode"[], "org_id")), "org_id", NULL::character varying, NULL::bigint));

DROP POLICY "Allow update for auth (admin+)" ON "public"."orgs";
CREATE POLICY"Allow update for auth (admin+)" ON "public"."orgs" FOR UPDATE TO "authenticated", "anon" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org"('{all,write}'::"public"."key_mode"[], "id"), "id", NULL::character varying, NULL::bigint)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org"('{all,write}'::"public"."key_mode"[], "id"), "id", NULL::character varying, NULL::bigint));

DROP POLICY "Allow select for auth, api keys (read+)" ON "public"."orgs";
CREATE POLICY "Allow select for auth, api keys (read+)" ON "public"."orgs" FOR SELECT TO "authenticated", "anon" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity_org"('{read,upload,write,all}'::"public"."key_mode"[], "id"), "id", NULL::character varying, NULL::bigint));

CREATE OR REPLACE FUNCTION "public"."get_identity"("keymode" "public"."key_mode"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    auth_uid uuid;
    api_key_text text;
    api_key record;
Begin
  RAISE EXCEPTION 'get_identity called!';  
End;
$$;


CREATE OR REPLACE FUNCTION "public"."get_orgs_v6"()
RETURNS TABLE(
    "gid" "uuid", 
    "created_by" "uuid", 
    "logo" "text", 
    "name" "text", 
    "role" character varying, 
    "paying" boolean, 
    "trial_left" integer, 
    "can_use_more" boolean, 
    "is_canceled" boolean, 
    "app_count" bigint, 
    "subscription_start" timestamp with time zone, 
    "subscription_end" timestamp with time zone, 
    "management_email" "text",
    "is_yearly" boolean
)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  api_key_text text;
  api_key record;
  user_id uuid;
BEGIN
  SELECT (("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text") into api_key_text;
  
  -- Initialize user_id as NULL
  user_id := NULL;
  
  -- Check for API key first
  IF api_key_text IS NOT NULL THEN
    SELECT * FROM apikeys WHERE key=api_key_text into api_key;
    IF api_key IS NOT NULL THEN
      user_id := api_key.user_id;
      
      -- Check limited_to_orgs only if api_key exists and has restrictions
      IF api_key.limited_to_orgs IS DISTINCT FROM '{}' THEN    
        return query select orgs.* from get_orgs_v6(user_id) orgs 
        where orgs.gid = ANY(api_key.limited_to_orgs::uuid[]);
        RETURN;
      END IF;
    END IF;
  END IF;

  -- If no valid API key user_id yet, try to get from identity
  IF user_id IS NULL THEN
    SELECT get_identity() into user_id;
  END IF;

  IF user_id IS NULL THEN
    RAISE EXCEPTION 'Cannot do that as postgres!';
  END IF;

  return query select * from get_orgs_v6(user_id);
END;  
$$;