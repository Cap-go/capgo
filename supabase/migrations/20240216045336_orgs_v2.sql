-- Each owner -> "super_admin" role in "org users"

do
$$
declare
    org_record RECORD;
begin
    FOR org_record IN
        SELECT * from orgs
    LOOP
        insert into org_users ( org_id, user_id, user_right, app_id, channel_id )
        values(org_record.id, org_record.created_by, 'super_admin'::"user_min_right", null, null);
    END LOOP;
end;
$$;

-- Create "get_identity" fn
-- This will disallow the usage of API keys
CREATE OR REPLACE FUNCTION "public"."get_identity"() RETURNS uuid
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    auth_uid uuid;
    api_key_text text;
    api_key record;
Begin
  SELECT auth.uid() into auth_uid;

  -- JWT auth.uid is not null, reutrn
  IF auth_uid IS NOT NULL THEN
    return auth_uid;
  END IF;

  -- JWT is null
  RETURN NULL;
End;
$$;

-- This will allow the usage of apikeys
CREATE OR REPLACE FUNCTION "public"."get_identity"("keymode" "public"."key_mode"[]) RETURNS uuid
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

  if api_key IS NOT NULL THEN
    RETURN api_key.user_id;
  END IF;

  RETURN NULL;
End;
$$;

CREATE OR REPLACE FUNCTION "public"."get_identity_apikey_only"("keymode" "public"."key_mode"[]) RETURNS uuid
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    api_key_text text;
    api_key record;
Begin
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

  if api_key IS NOT NULL THEN
    RETURN api_key.user_id;
  END IF;

  RETURN NULL;
End;
$$;

-- Alter "check_min_rights" in a way what will check if uid != null

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

CREATE OR REPLACE FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" text) RETURNS uuid
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  org_id uuid;
begin
  select apps.owner_org from apps
  into org_id
  where ((apps.app_id)::text = (get_user_main_org_id_by_app_id.app_id)::text)
  limit 1;

  return org_id;
End;
$$;

CREATE OR REPLACE FUNCTION "public"."auto_owner_org_by_app_id"() RETURNS trigger
   LANGUAGE plpgsql AS
$$BEGIN
  IF NEW."app_id" is distinct from OLD."app_id" AND OLD."app_id" is distinct from NULL THEN
    RAISE EXCEPTION 'changing the app_id is not allowed';
  END IF;

  NEW.owner_org = get_user_main_org_id_by_app_id(NEW."app_id");

   RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION "public"."get_orgs_v3"("userid" "uuid") RETURNS TABLE(gid uuid, created_by uuid, logo text, name text, role varchar, paying boolean, trial_left integer, can_use_more boolean, is_canceled boolean)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  return query select 
  o.id as gid, 
  o.created_by, 
  o.logo, 
  o.name, 
  org_users.user_right::varchar, 
  is_paying(o.created_by) as paying, 
  is_trial(o.created_by) as trial_left, 
  is_allowed_action_user(o.created_by) as can_use_more,
  is_canceled(o.created_by) as is_canceled
  from orgs as o
  join org_users on (org_users."user_id"=get_orgs_v3.userid and o.id = org_users."org_id");
END;  
$$;

-- Alter table "apps" with new owner system

-- create "owner_org"
ALTER TABLE apps ADD COLUMN 
owner_org uuid;

-- Set owner_org
UPDATE apps
SET owner_org=get_user_main_org_id(user_id);

-- Mark owner_org as not null
-- ALTER TABLE apps
-- ALTER COLUMN owner_org SET NOT NULL;

ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;

ALTER TABLE apps
ALTER COLUMN owner_org SET NOT NULL;

DROP POLICY "Allow apikey to insert" on "apps";
DROP POLICY "Allow apikey to update they app" on "apps";
DROP POLICY "Allow app owner to all" on "apps";
DROP POLICY "Allow org member to select" on "apps";
DROP POLICY "Allow org member's API key to select" on "apps";
DROP POLICY "allow apikey to delete" on "apps";
DROP POLICY "allow apikey to select" on "apps";

ALTER TABLE apps DROP COLUMN user_id;

CREATE POLICY "Allow for auth, api keys (read+)" ON "public"."apps"
AS PERMISSIVE FOR SELECT
TO anon, authenticated
USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[]), owner_org, app_id, NULL));

CREATE POLICY "Allow update for auth, api keys (write, all) (admin+)" ON "public"."apps"
AS PERMISSIVE FOR UPDATE
TO anon, authenticated
USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"('{write,all}'::"public"."key_mode"[]), owner_org, app_id, NULL))
WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"('{write,all}'::"public"."key_mode"[]), owner_org, app_id, NULL));

CREATE POLICY "Allow all for auth (super_admin+)" ON "public"."apps"
AS PERMISSIVE FOR ALL
TO authenticated
USING ("public"."check_min_rights"('super_admin'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL))
WITH CHECK ("public"."check_min_rights"('super_admin'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));

-- CHANGE: Org users may update "apps", previously only owner could do that. Required perm: "admin"

-- Alter table "apps" done; 

-- Alter table "app_versions" start;

DROP TRIGGER force_valid_user_id on "app_versions";
DROP FUNCTION "public"."force_valid_user_id"();

ALTER TABLE app_versions ADD COLUMN 
owner_org uuid;

UPDATE app_versions
SET owner_org=get_user_main_org_id_by_app_id(app_id);

ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;

CREATE TRIGGER force_valid_owner_org_app_versions
   BEFORE INSERT OR UPDATE ON "public"."app_versions" FOR EACH ROW
   EXECUTE PROCEDURE "public"."auto_owner_org_by_app_id"();  

ALTER TABLE app_versions
ALTER COLUMN owner_org SET NOT NULL;

DROP POLICY "Allow apikey to insert" on "app_versions";
DROP POLICY "Allow apikey to select" on "app_versions";
DROP POLICY "Allow org member (write) to update" on "app_versions";
DROP POLICY "Allow org members to select" on "app_versions";
DROP POLICY "Allow owner to all" on "app_versions";
DROP POLICY "Allow owner to listen insert" on "app_versions";
DROP POLICY "allow apikey to upload" on "app_versions";

CREATE POLICY "Allow for auth, api keys (read+)" ON "public"."app_versions"
AS PERMISSIVE FOR SELECT
TO anon, authenticated
USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[]), owner_org, app_id, NULL));

-- change: Old RLS permited only 'write' org users to read, idk why

CREATE POLICY "Allow update for api keys (write,all,upload) (upload+)" ON "public"."app_versions"
AS PERMISSIVE FOR UPDATE
TO anon, authenticated
USING ("public"."check_min_rights"('upload'::"public"."user_min_right", "public"."get_identity_apikey_only"('{write,all,upload}'::"public"."key_mode"[]), owner_org, app_id, NULL))
WITH CHECK ("public"."check_min_rights"('upload'::"public"."user_min_right", "public"."get_identity_apikey_only"('{write,all,upload}'::"public"."key_mode"[]), owner_org, app_id, NULL));

CREATE POLICY "Allow update for auth (write+)" ON "public"."app_versions"
AS PERMISSIVE FOR UPDATE
TO anon, authenticated
USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL))
WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));

ALTER TABLE app_versions DROP COLUMN user_id;

-- App versions done;

-- Alter app_versions_meta
ALTER TABLE app_versions_meta ADD COLUMN 
owner_org uuid;

UPDATE app_versions_meta
SET owner_org=get_user_main_org_id_by_app_id(app_id);

ALTER TABLE ONLY "public"."app_versions_meta"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;

CREATE TRIGGER force_valid_owner_org_app_versions_meta
   BEFORE INSERT OR UPDATE ON "public"."app_versions_meta" FOR EACH ROW
   EXECUTE PROCEDURE "public"."auto_owner_org_by_app_id"();  

ALTER TABLE app_versions_meta
ALTER COLUMN owner_org SET NOT NULL;

DROP POLICY "Allow org members to select" on "app_versions_meta";
DROP POLICY "Allow user to get they meta" on "app_versions_meta";

CREATE POLICY "Allow read for auth (read+)" ON "public"."app_versions_meta"
AS PERMISSIVE FOR SELECT
TO anon, authenticated
USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));

ALTER TABLE app_versions_meta DROP COLUMN user_id;

-- app_versions_meta done

-- channel_devices start
ALTER TABLE channel_devices ADD COLUMN 
owner_org uuid;

UPDATE channel_devices
SET owner_org=get_user_main_org_id_by_app_id(app_id);

ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;

CREATE TRIGGER force_valid_owner_org_channel_devices
   BEFORE INSERT OR UPDATE ON "public"."channel_devices" FOR EACH ROW
   EXECUTE PROCEDURE "public"."auto_owner_org_by_app_id"();  

ALTER TABLE channel_devices
ALTER COLUMN owner_org SET NOT NULL;

DROP POLICY "Allow all to app owner" on "channel_devices";
DROP POLICY "Allow org member (write) to delete" on "channel_devices";
DROP POLICY "Allow org member (write) to insert" on "channel_devices";
DROP POLICY "Allow org member to read" on "channel_devices";

CREATE POLICY "Allow read for auth (read+)" ON "public"."channel_devices"
AS PERMISSIVE FOR SELECT
TO authenticated
USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));

CREATE POLICY "Allow insert for auth (write+)" ON "public"."channel_devices"
AS PERMISSIVE FOR UPDATE
TO authenticated
USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL))
WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));

CREATE POLICY "Allow delete for auth (write+)" ON "public"."channel_devices"
AS PERMISSIVE FOR DELETE
TO authenticated
USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));

ALTER TABLE channel_devices DROP COLUMN created_by;

-- channel_devices end


-- devices_override start
ALTER TABLE devices_override ADD COLUMN 
owner_org uuid;

UPDATE devices_override
SET owner_org=get_user_main_org_id_by_app_id(app_id);

ALTER TABLE ONLY "public"."devices_override"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;

CREATE TRIGGER force_valid_owner_org_devices_override
   BEFORE INSERT OR UPDATE ON "public"."devices_override" FOR EACH ROW
   EXECUTE PROCEDURE "public"."auto_owner_org_by_app_id"();  

ALTER TABLE devices_override
ALTER COLUMN owner_org SET NOT NULL;

DROP POLICY "Allow all to app owner" on "devices_override";
DROP POLICY "Allow org member (write) to delete" on "devices_override";
DROP POLICY "Allow org member (write) to insert" on "devices_override";
DROP POLICY "Allow org member to read" on "devices_override";

CREATE POLICY "Allow read for auth (read+)" ON "public"."devices_override"
AS PERMISSIVE FOR SELECT
TO authenticated
USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));

CREATE POLICY "Allow insert for auth (write+)" ON "public"."devices_override"
AS PERMISSIVE FOR UPDATE
TO authenticated
USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL))
WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));

CREATE POLICY "Allow delete for auth (write+)" ON "public"."devices_override"
AS PERMISSIVE FOR DELETE
TO authenticated
USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));

ALTER TABLE devices_override DROP COLUMN created_by;

-- devices_override end

-- channel table start
ALTER TABLE channels ADD COLUMN 
owner_org uuid;

UPDATE channels
SET owner_org=get_user_main_org_id_by_app_id(app_id);

ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;

CREATE TRIGGER force_valid_owner_org_channels
   BEFORE INSERT OR UPDATE ON "public"."channels" FOR EACH ROW
   EXECUTE PROCEDURE "public"."auto_owner_org_by_app_id"();  

ALTER TABLE channels
ALTER COLUMN owner_org SET NOT NULL;

DROP POLICY "All to api owner" on "channels";
DROP POLICY "Allow api to insert" on "channels";
DROP POLICY "Allow api to update" on "channels";
DROP POLICY "Allow app owner or admin" on "channels";
DROP POLICY "Allow org admins to edit" on "channels";
DROP POLICY "Allow org admins to insert" on "channels";
DROP POLICY "Allow org member's api key to select" on "channels";
DROP POLICY "Allow org member's api key to update" on "channels";
DROP POLICY "Allow org members to select" on "channels";
DROP POLICY "Select if app api" on "channels";

CREATE POLICY "Allow for auth, api keys (read+)" ON "public"."channels"
AS PERMISSIVE FOR SELECT
TO anon, authenticated
USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[]), owner_org, app_id, NULL));

CREATE POLICY "Allow update for auth, api keys (write, all, upload) (write+)" ON "public"."channels"
AS PERMISSIVE FOR UPDATE
TO anon, authenticated
USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"('{write,all,upload}'::"public"."key_mode"[]), owner_org, app_id, NULL))
WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"('{write,all,upload}'::"public"."key_mode"[]), owner_org, app_id, NULL));

CREATE POLICY "Allow insert for auth, api keys (write, all) (admin+)" ON "public"."channels"
AS PERMISSIVE FOR INSERT
TO anon, authenticated
USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"('{write,all}'::"public"."key_mode"[]), owner_org, app_id, NULL))
WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"('{write,all}'::"public"."key_mode"[]), owner_org, app_id, NULL));

CREATE POLICY "Allow all for auth (admin+)" ON "public"."channels"
AS PERMISSIVE FOR ALL
TO authenticated
USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL))
WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));

ALTER TABLE channels DROP COLUMN created_by;

-- channels done