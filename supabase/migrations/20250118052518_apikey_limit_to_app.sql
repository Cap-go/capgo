DROP POLICY "Enable all for user based on user_id" ON "public"."apikeys";
CREATE POLICY "Enable all for user based on user_id" ON "public"."apikeys" TO "authenticated" USING ((((select auth.uid()) = "user_id"))) WITH CHECK ((((select auth.uid()) = "user_id")));

ALTER TABLE apikeys
ADD COLUMN limited_to_apps varchar[] DEFAULT '{}';

CREATE OR REPLACE FUNCTION "public"."get_identity_org_appid"("keymode" "public"."key_mode"[], "org_id" "uuid", "app_id" "varchar") RETURNS "uuid"
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
    IF api_key.limited_to_apps IS DISTINCT FROM '{}' THEN
      IF NOT (app_id = ANY(api_key.limited_to_apps)) THEN
          RETURN NULL;
      END IF;
    END IF;

    RETURN api_key.user_id;
  END IF;

  RETURN NULL;
End;
$$;

CREATE OR REPLACE FUNCTION "public"."get_identity_org"("keymode" "public"."key_mode"[], "org_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RAISE EXCEPTION 'get_identity_org is deprecated';
End;
$$;

CREATE OR REPLACE FUNCTION "public"."get_identity_org_allowed"("keymode" "public"."key_mode"[], "org_id" "uuid") RETURNS "uuid"
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
    return 'NO_EMAIL';
  END IF;
End;
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

  IF api_key.limited_to_apps IS DISTINCT FROM '{}' THEN
    IF NOT (appid = ANY(api_key.limited_to_apps)) THEN
        RETURN false;
    END IF;
  END IF;

  RETURN (check_min_rights("right", userid, org_id, "appid", NULL::bigint));
End;
$$;


DROP POLICY "Allow insert for auth, api keys (write, all) (admin+)" ON "public"."channels";
CREATE POLICY "Allow insert for auth, api keys (write, all) (admin+)" ON "public"."channels" FOR INSERT TO "authenticated", "anon" WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));

DROP POLICY "Allow all for auth (admin+) (any apikey)" ON "public"."channels";
CREATE POLICY "Allow all for auth (admin+) (all apikey)" ON "public"."channels" TO "authenticated","anon" USING ("public"."check_min_rights"('admin'::"public"."user_min_right","public"."get_identity_org_appid"('{all}'::"public"."key_mode"[], "owner_org", "app_id"),"owner_org","app_id",NULL::BIGINT)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right","public"."get_identity_org_appid"('{all}'::"public"."key_mode"[], "owner_org", "app_id"),"owner_org","app_id",NULL::BIGINT));

DROP POLICY "Allow select for auth, api keys (read+)" ON "public"."channels";
CREATE POLICY "Allow select for auth, api keys (read+)" ON "public"."channels" FOR SELECT TO "authenticated", "anon" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity_org_appid"('{read,upload,write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));

DROP POLICY "Allow update for auth, api keys (write, all, upload) (write+)" ON "public"."channels";
CREATE POLICY "Allow update for auth, api keys (write, all) (write+)" ON "public"."channels" FOR UPDATE TO "authenticated", "anon" USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint)) WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));

-- apps
DROP POLICY "Allow update for auth, api keys (write, all) (admin+)" ON "public"."apps";
CREATE POLICY "Allow update for auth, api keys (write, all) (admin+)" ON "public"."apps" FOR UPDATE TO "authenticated", "anon" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));

DROP POLICY "Allow for auth, api keys (read+)" ON "public"."apps";
CREATE POLICY "Allow for auth, api keys (read+)" ON "public"."apps" FOR SELECT TO "authenticated", "anon" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity_org_appid"('{read,upload,write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));

DROP POLICY "Allow insert for apikey (write,all) (admin+)" ON "public"."apps";
CREATE POLICY "Allow insert for apikey (write,all) (admin+)" ON "public"."apps" FOR INSERT TO "anon" WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));

-- app_versions
DROP POLICY "Allow for auth, api keys (read+)" ON "public"."app_versions";
CREATE POLICY "Allow for auth, api keys (read+)" ON "public"."app_versions" FOR SELECT TO "authenticated", "anon" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity_org_appid"('{read,upload,write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));

DROP POLICY "Allow insert for api keys (write,all,upload) (upload+)" ON "public"."app_versions";
CREATE POLICY "Allow insert for api keys (write,all,upload) (upload+)" ON "public"."app_versions" FOR INSERT TO "anon" WITH CHECK ("public"."check_min_rights"('upload'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all,upload}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));

DROP POLICY "Allow update for api keys (write,all,upload) (upload+)" ON "public"."app_versions";
CREATE POLICY "Allow update for api keys (write,all,upload) (upload+)" ON "public"."app_versions" FOR UPDATE TO "anon" USING ("public"."check_min_rights"('upload'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all,upload}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint)) WITH CHECK ("public"."check_min_rights"('upload'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all,upload}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));

DROP POLICY "Allow update for auth (write+)" ON "public"."app_versions";
CREATE POLICY "Allow update for auth (write+)" ON "public"."app_versions" FOR UPDATE TO "authenticated", "anon" USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all,upload}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint)) WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all,upload}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));

-- app_versions_meta
DROP POLICY "Allow read for auth (read+)" ON "public"."app_versions_meta";
CREATE POLICY "Allow read for auth (read+)" ON "public"."app_versions_meta" FOR SELECT TO "authenticated", "anon" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity_org_appid"('{read,upload,write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));

-- org_users
DROP POLICY "Allow to self delete" ON "public"."org_users";
CREATE POLICY "Allow to self delete" ON "public"."org_users" FOR DELETE TO "authenticated", "anon" USING (("user_id" = (select get_identity_org_allowed('{read,upload,write,all}'::"public"."key_mode"[], "org_id"))));

DROP POLICY "Allow memeber and owner to select" ON "public"."org_users";
CREATE POLICY "Allow memeber and owner to select" ON "public"."org_users" FOR SELECT TO "authenticated", "anon"  USING (("public"."is_member_of_org"((select get_identity_org_allowed('{read,upload,write,all}'::"public"."key_mode"[], "org_id")), "org_id") OR "public"."is_owner_of_org"((select get_identity_org_allowed('{read,upload,write,all}'::"public"."key_mode"[], "org_id")), "org_id")));

DROP POLICY "Allow org admin to all" ON "public"."org_users";
CREATE POLICY "Allow org admin to all" ON "public"."org_users" TO "authenticated", "anon"  USING ("public"."check_min_rights"('admin'::"public"."user_min_right", (select get_identity_org_allowed('{all}'::"public"."key_mode"[], "org_id")), "org_id", NULL::character varying, NULL::bigint)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", (select get_identity_org_allowed('{all}'::"public"."key_mode"[], "org_id")), "org_id", NULL::character varying, NULL::bigint));

DROP POLICY "Allow update for auth (admin+)" ON "public"."orgs";
CREATE POLICY"Allow update for auth (admin+)" ON "public"."orgs" FOR UPDATE TO "authenticated", "anon" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org_allowed"('{all,write}'::"public"."key_mode"[], "id"), "id", NULL::character varying, NULL::bigint)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org_allowed"('{all,write}'::"public"."key_mode"[], "id"), "id", NULL::character varying, NULL::bigint));

DROP POLICY "Allow select for auth, api keys (read+)" ON "public"."orgs";
CREATE POLICY "Allow select for auth, api keys (read+)" ON "public"."orgs" FOR SELECT TO "authenticated", "anon" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity_org_allowed"('{read,upload,write,all}'::"public"."key_mode"[], "id"), "id", NULL::character varying, NULL::bigint));


