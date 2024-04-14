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

-- Spoof the api key
-- DO $$
-- BEGIN
-- execute format('set request.headers=%L', (select jsonb_build_object('capgkey', 'd3456c8f-7ce7-44c5-9967-a52b8bef35ee')::text));
-- END $$ LANGUAGE "plpgsql";
-- SELECT ("current_setting"('request.headers'::"text", true));
-- 

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

  if api_key IS DISTINCT FROM  NULL THEN
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

  if api_key IS DISTINCT FROM NULL THEN
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

CREATE OR REPLACE FUNCTION public.get_total_stats_v5(userid uuid)
RETURNS TABLE(mau bigint, bandwidth double precision, storage double precision)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    cycle_info RECORD;
    response http_response;
    url text;
    req_headers http_header[];
    req_body text;
    app_activity jsonb; -- Declare app_activity as jsonb
    total_mau bigint := 0;
    total_bandwidth numeric := 0;
    total_storage double precision;
    org_id uuid;
BEGIN
    -- Retrieve the subscription anchor start and end dates using get_cycle_info function
    SELECT * INTO cycle_info FROM public.get_cycle_info(userid) LIMIT 1;
    SELECT get_user_main_org_id(userid) into org_id;

    -- Get the total storage size by calling the get_total_storage_size function
    SELECT get_total_storage_size_org(org_id) INTO total_storage;

    -- Construct the URL
    url := get_db_url() || '/functions/v1/' || '/triggers/get_total_stats'; -- Use the confirmed URL

    -- Set up the headers
    req_headers := ARRAY[
        http_header('apisecret', get_apikey()) -- Replace with your actual API secret
    ];

    -- Prepare the body with the necessary parameters, using the correct keys and dates from get_cycle_info
    req_body := jsonb_build_object(
        'userId', userid::text,
        'startDate', to_char(cycle_info.subscription_anchor_start, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'endDate', to_char(cycle_info.subscription_anchor_end, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )::text;

    -- Make the synchronous HTTP POST request, including the headers
    response := http((
        'POST',
        url,
        req_headers,
        'application/json',
        req_body
    )::http_request);

    -- Check if the request was successful
    IF response.status = 200 THEN
        -- Parse the JSON response and loop through each app activity
        FOR app_activity IN SELECT * FROM jsonb_array_elements(response.content::jsonb)
        LOOP
            total_mau := total_mau + (app_activity ->> 'mau')::bigint;
            total_bandwidth := total_bandwidth + (app_activity ->> 'bandwidth')::numeric;
        END LOOP;

        -- Return the aggregated results
        RETURN QUERY SELECT
            total_mau AS mau,
            ROUND(convert_bytes_to_gb(total_bandwidth)::numeric, 2)::double precision AS bandwidth,
            ROUND(convert_bytes_to_gb(total_storage)::numeric, 2)::double precision AS storage;
    ELSE
        -- If the request was not successful, return empty data
        RETURN QUERY SELECT
            0::bigint AS mau,
            0::double precision AS bandwidth,
            0::double precision AS storage;
    END IF;
END;
$function$;

DROP FUNCTION "public"."get_org_members"("guild_id" uuid);
CREATE OR REPLACE FUNCTION "public"."get_org_members"("guild_id" uuid) RETURNS table(aid int8, uid uuid, email character varying, image_url character varying, role "public"."user_min_right")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  IF NOT (is_owner_of_org(auth.uid(), get_org_members.guild_id) OR check_min_rights('read'::user_min_right, auth.uid(), get_org_members.guild_id, NULL::character varying, NULL::bigint)) THEN
    raise exception 'NO_RIGHTS';
  END IF;

  return query select o.id as aid, users.id as uid, users.email, users.image_url, o.user_right as role from org_users as o
  join users on users.id = o.user_id
  where o.org_id=get_org_members.guild_id
  AND (is_member_of_org(users.id, o.org_id) OR is_owner_of_org(users.id, o.org_id));
End;
$$;

CREATE OR REPLACE FUNCTION "public"."noupdate"() RETURNS trigger
   LANGUAGE plpgsql AS $$
DECLARE
    val RECORD;
    is_diffrent boolean;
BEGIN
    -- API key? We do not care
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    -- If the user has the 'admin' role then we do not care
    IF check_min_rights('admin'::user_min_right, auth.uid(), OLD.owner_org, NULL::character varying, NULL::bigint) THEN
        RETURN NEW;
    END IF;

    for val in
      select * from json_each_text(row_to_json(NEW))
    loop
      -- raise warning '?? % % %', val.key, val.value, format('SELECT (NEW."%s" <> OLD."%s")', val.key, val.key);

      EXECUTE format('SELECT ($1."%s" is distinct from $2."%s")', val.key, val.key) using NEW, OLD
      INTO is_diffrent;

      IF is_diffrent AND val.key <> 'version' AND val.key <> 'secondVersion' AND key.value <> 'updated_at' THEN
          RAISE EXCEPTION 'not allowed %', val.key;
      END IF;
    end loop;

   RETURN NEW;
END;$$;

-- Here to prevent the compatibility from breaking
CREATE OR REPLACE FUNCTION "public"."get_org_perm_for_apikey"("apikey" "text", "app_id" "text") RETURNS text
   LANGUAGE plpgsql SECURITY DEFINER AS $$
<<get_org_perm_for_apikey>>
Declare  
  apikey_user_id uuid;
  org_id uuid;
  user_perm "public"."user_min_right";
BEGIN
  SELECT get_user_id(apikey) into apikey_user_id;

  IF apikey_user_id IS NULL THEN
    return 'INVALID_APIKEY';
  END IF;

  SELECT owner_org from apps
  INTO org_id
  WHERE apps.app_id=get_org_perm_for_apikey.app_id
  limit 1;

  IF org_id IS NULL THEN
    return 'NO_APP';
  END IF;

  SELECT user_right from org_users
  INTO user_perm
  WHERE user_id=apikey_user_id
  AND org_users.org_id=get_org_perm_for_apikey.org_id;

  IF user_perm IS NULL THEN
    return 'perm_none';
  END IF;

  -- For compatibility reasons if you are a super_admin we will return "owner"
  -- The old cli relies on this behaviour, on get_org_perm_for_apikey_v2 we will change that
  IF user_perm='super_admin'::"public"."user_min_right" THEN
    return 'perm_owner';
  END IF;

  RETURN format('perm_%s', user_perm);
END;$$;

CREATE OR REPLACE FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM app_versions
  WHERE app_id=appid
  AND name=name_version));
End;  
$$;

CREATE OR REPLACE FUNCTION "public"."has_app_right_userid"("appid" character varying, "right" user_min_right, "userid" uuid)
 RETURNS boolean
 LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE 
  org_id uuid;
Begin
  org_id := get_user_main_org_id_by_app_id(appid);

  RETURN (is_owner_of_org(userid, org_id) OR check_min_rights("right", userid, org_id, "appid", NULL::bigint));
End;
$$;

REVOKE EXECUTE ON FUNCTION public.has_app_right_userid("appid" character varying, "right" user_min_right, "userid" uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.has_app_right_userid("appid" character varying, "right" user_min_right, "userid" uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_app_right_userid("appid" character varying, "right" user_min_right, "userid" uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.has_app_right_userid("appid" character varying, "right" user_min_right, "userid" uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.has_app_right_userid("appid" character varying, "right" user_min_right, "userid" uuid) TO service_role;

CREATE OR REPLACE FUNCTION "public"."has_app_right"("appid" character varying, "right" user_min_right)
 RETURNS boolean
 LANGUAGE plpgsql
SECURITY DEFINER
AS $$
Begin
  RETURN has_app_right_userid("appid", "right", auth.uid());
End;
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

CREATE OR REPLACE FUNCTION "public"."guard_r2_path"() RETURNS trigger
   LANGUAGE plpgsql AS
$$BEGIN
  IF NEW."r2_path" is not distinct from NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."r2_path" is distinct from (select format('orgs/%s/apps/%s/%s.zip', NEW.owner_org, encode(NEW.app_id::bytea, 'base64'), NEW.id)) THEN
    RAISE EXCEPTION 'The expected r2_path is %', (select format('orgs/%s/apps/%s/%s.zip', NEW.owner_org, encode(NEW.app_id::bytea, 'base64'), NEW.id));
  END IF;

   RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION "public"."force_valid_user_id_on_app"() RETURNS trigger
   LANGUAGE plpgsql AS
$$BEGIN
  NEW.user_id = (select created_by from orgs where id = (NEW."owner_org"));

   RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION "public"."get_orgs_v4"("userid" "uuid") RETURNS TABLE(
  gid uuid, 
  created_by uuid, 
  logo text, 
  name text, 
  role varchar, 
  paying boolean, 
  trial_left integer, 
  can_use_more boolean, 
  is_canceled boolean, 
  app_count bigint,
  subscription_start timestamp with time zone,
  subscription_end timestamp with time zone
)
LANGUAGE "plpgsql" SECURITY DEFINER
  AS $$
BEGIN
  return query select 
  sub.id as gid, 
  sub.created_by, 
  sub.logo, 
  sub.name, 
  org_users.user_right::varchar, 
  is_paying(sub.created_by) as paying, 
  is_trial(sub.created_by) as trial_left, 
  is_allowed_action_user(sub.created_by) as can_use_more,
  is_canceled(sub.created_by) as is_canceled,
  (select count(*) from apps where owner_org = sub.id) as app_count,
  (sub.f).subscription_anchor_start as subscription_start,
  (sub.f).subscription_anchor_end as subscription_end
  from (
    select get_cycle_info(o.created_by) as f, o.* as o from orgs as o
  ) sub
  join org_users on (org_users."user_id"=get_orgs_v4.userid and sub.id = org_users."org_id");
END;  
$$;

CREATE OR REPLACE FUNCTION "public"."get_orgs_v4"() RETURNS TABLE(
  gid uuid, 
  created_by uuid, 
  logo text, 
  name text, 
  role varchar, 
  paying boolean, 
  trial_left integer, 
  can_use_more boolean, 
  is_canceled boolean, 
  app_count bigint,
  subscription_start timestamp with time zone,
  subscription_end timestamp with time zone
)
LANGUAGE "plpgsql" SECURITY DEFINER
  AS $$
DECLARE
  user_id uuid;
BEGIN
  SELECT get_identity('{read,upload,write,all}'::"public"."key_mode"[]) into user_id;
  IF user_id IS NOT DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'Cannot do that as postgres!';
  END IF;

  return query select * from get_orgs_v4("user_id");
END;  
$$;

REVOKE EXECUTE ON FUNCTION "public"."get_orgs_v4"("userid" "uuid") FROM public;
REVOKE EXECUTE ON FUNCTION "public"."get_orgs_v4"("userid" "uuid") FROM anon;
REVOKE EXECUTE ON FUNCTION "public"."get_orgs_v4"("userid" "uuid") FROM authenticated;
GRANT EXECUTE ON FUNCTION "public"."get_orgs_v4"("userid" "uuid") TO postgres;
GRANT EXECUTE ON FUNCTION "public"."get_orgs_v4"("userid" "uuid") TO service_role;

CREATE OR REPLACE FUNCTION public.get_total_storage_size_org(org_id uuid)
RETURNS double precision
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    total_size double precision := 0;
BEGIN
    SELECT COALESCE(SUM(app_versions_meta.size), 0) INTO total_size
    FROM app_versions
    INNER JOIN app_versions_meta ON app_versions.id = app_versions_meta.id
    WHERE app_versions.owner_org = org_id
    AND app_versions.deleted = false;

    RETURN total_size;
END;  
$$;

CREATE OR REPLACE FUNCTION public.get_total_app_storage_size_orgs(org_id uuid, app_id character varying)
RETURNS double precision
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    total_size double precision := 0;
BEGIN
    SELECT COALESCE(SUM(app_versions_meta.size), 0) INTO total_size
    FROM app_versions
    INNER JOIN app_versions_meta ON app_versions.id = app_versions_meta.id
    WHERE app_versions.owner_org = org_id
    AND app_versions.app_id = get_total_app_storage_size_orgs.app_id
    AND app_versions.deleted = false;

    RETURN total_size;
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

-- TODO: In v3 we will drop this - right now we CANNOT drop this column for compatibility reasons
-- ALTER TABLE apps DROP COLUMN user_id;

-- We also have to make sure that `user_id` can be nullable and that it is allways the correct one. 
-- This is what this trigger does.

ALTER TABLE apps
ALTER COLUMN user_id DROP NOT NULL;

CREATE TRIGGER force_valid_user_id_apps
   BEFORE INSERT OR UPDATE ON "public"."apps" FOR EACH ROW
   EXECUTE PROCEDURE "public"."force_valid_user_id_on_app"();  

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

CREATE POLICY "Allow insert for apikey (write,all) (admin+)" ON "public"."apps"
AS PERMISSIVE FOR INSERT
TO anon
WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_apikey_only"('{write,all}'::"public"."key_mode"[]), owner_org, NULL, NULL));

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

CREATE POLICY "Allow all for auth (super_admin+)" ON "public"."app_versions"
AS PERMISSIVE FOR ALL
TO authenticated
USING ("public"."check_min_rights"('super_admin'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL))
WITH CHECK ("public"."check_min_rights"('super_admin'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));

CREATE POLICY "Allow insert for api keys (write,all,upload) (upload+)" ON "public"."app_versions"
AS PERMISSIVE FOR INSERT
TO anon, authenticated
WITH CHECK ("public"."check_min_rights"('upload'::"public"."user_min_right", "public"."get_identity_apikey_only"('{write,all,upload}'::"public"."key_mode"[]), owner_org, app_id, NULL));

CREATE POLICY "Allow update for auth (write+)" ON "public"."app_versions"
AS PERMISSIVE FOR UPDATE
TO anon, authenticated
USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL))
WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));

ALTER TABLE app_versions DROP COLUMN user_id;
-- For compatibility reasons we will readd the user_id
-- But this time it will be nulable + no constraint
-- New cli versions will not set the user_id
ALTER TABLE app_versions ADD COLUMN 
user_id uuid;

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
