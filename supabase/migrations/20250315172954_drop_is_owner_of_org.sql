-- Drop is_owner_of_org function as it's no longer needed
-- Replace all usages with check_min_rights('super_admin')

-- Replace "Allow org owner to all" policy on org_users
DROP POLICY IF EXISTS "Allow org owner to all" ON "public"."org_users";
CREATE POLICY "Allow super admin to all" ON "public"."org_users" TO "authenticated" 
USING ("public"."check_min_rights"('super_admin'::"public"."user_min_right", (select auth.uid()), "org_id", NULL::character varying, NULL::bigint)) 
WITH CHECK ("public"."check_min_rights"('super_admin'::"public"."user_min_right", (select auth.uid()), "org_id", NULL::character varying, NULL::bigint));

-- Update has_app_right_userid function to use check_min_rights instead of is_owner_of_org
CREATE OR REPLACE FUNCTION "public"."has_app_right_userid"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE 
  org_id uuid;
Begin
  org_id := get_user_main_org_id_by_app_id(appid);

  RETURN check_min_rights('super_admin'::"public"."user_min_right", userid, org_id, NULL::character varying, NULL::bigint) OR check_min_rights("right", userid, org_id, "appid", NULL::bigint);
End;
$$;

-- Update has_app_right_apikey function to use check_min_rights instead of is_owner_of_org
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

  RETURN check_min_rights('super_admin'::"public"."user_min_right", userid, org_id, NULL::character varying, NULL::bigint) OR check_min_rights("right", userid, org_id, "appid", NULL::bigint);
End;
$$;

-- Update get_app_versions function to use check_min_rights instead of is_owner_of_org
CREATE OR REPLACE FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT id
  FROM app_versions
  WHERE app_id=appid
  AND name=name_version
  AND owner_org=(select get_user_main_org_id_by_app_id(appid))
  AND (
    public.is_member_of_org(get_user_id(apikey), (SELECT get_user_main_org_id_by_app_id(appid)))
    OR
    public.check_min_rights('super_admin'::user_min_right, get_user_id(apikey), (SELECT get_user_main_org_id_by_app_id(appid)), NULL::character varying, NULL::bigint)
  ));
End;  
$$;

-- Update get_org_owner_id function to use check_min_rights instead of is_owner_of_org
CREATE OR REPLACE FUNCTION "public"."get_org_owner_id"("apikey" "text", "app_id" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Declare  
 org_owner_id uuid;
 real_user_id uuid;
 org_id uuid;
Begin
  SELECT apps.user_id FROM apps WHERE apps.app_id=get_org_owner_id.app_id into org_owner_id;
  SELECT get_user_main_org_id_by_app_id(app_id) INTO org_id;

  SELECT user_id
  INTO real_user_id
  FROM apikeys
  WHERE key=apikey;

  IF (public.is_member_of_org(real_user_id, org_id) IS FALSE AND public.check_min_rights('super_admin'::user_min_right, real_user_id, org_id, NULL::character varying, NULL::bigint) IS FALSE)
  THEN
    raise exception 'NO_RIGHTS';
  END IF;

  RETURN org_owner_id;
End;  
$$;

-- Update get_org_members function to use check_min_rights instead of is_owner_of_org
CREATE OR REPLACE FUNCTION "public"."get_org_members"("guild_id" "uuid") RETURNS TABLE("aid" bigint, "uid" "uuid", "email" character varying, "image_url" character varying, "role" "public"."user_min_right")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  IF NOT (check_min_rights('super_admin'::user_min_right, (select auth.uid()), get_org_members.guild_id, NULL::character varying, NULL::bigint) OR check_min_rights('read'::user_min_right, (select auth.uid()), get_org_members.guild_id, NULL::character varying, NULL::bigint)) THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;
  
  return query select * from get_org_members((select auth.uid()), get_org_members.guild_id);
End;
$$;

-- Update "Allow memeber and owner to select" policy on org_users
DROP POLICY IF EXISTS "Allow memeber and owner to select" ON "public"."org_users";
DROP POLICY IF EXISTS "Allow member and super admin to select" ON "public"."org_users";
CREATE POLICY "Allow member and super admin to select" ON "public"."org_users" FOR SELECT TO "authenticated", "anon"  
USING (("public"."is_member_of_org"((select get_identity_org_allowed('{read,upload,write,all}'::"public"."key_mode"[], "org_id")), "org_id") OR "public"."check_min_rights"('super_admin'::"public"."user_min_right", (select get_identity_org_allowed('{read,upload,write,all}'::"public"."key_mode"[], "org_id")), "org_id", NULL::character varying, NULL::bigint)));

-- Finally, drop the is_owner_of_org function
DROP FUNCTION IF EXISTS "public"."is_owner_of_org"("user_id" "uuid", "org_id" "uuid");
