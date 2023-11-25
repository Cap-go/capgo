-- https://github.com/Cap-go/capgo/blob/3dd137350d8485a3dcadd30397c0638bbea9a517/supabase/migrations/20230815171919_base.sql
CREATE TYPE "public"."orgs_table" AS (
    id uuid,
    created_by uuid,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    logo text,
    name text
);

CREATE TYPE "public"."owned_orgs" AS (
    "id" uuid, 
    "created_by" uuid, 
    "logo" text, 
    "name" text, 
    "role" varchar
);

ALTER TYPE "user_min_right" ADD VALUE 'invite_read' BEFORE 'read';
ALTER TYPE "user_min_right" ADD VALUE 'invite_upload' BEFORE 'read';
ALTER TYPE "user_min_right" ADD VALUE 'invite_write' BEFORE 'read';
ALTER TYPE "user_min_right" ADD VALUE 'invite_admin' BEFORE 'read';

CREATE FUNCTION "public"."is_member_of_org"("user_id" uuid, "org_id" uuid) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Declare
 is_found integer;
Begin
  SELECT count(*)
  INTO is_found
  FROM orgs
  JOIN org_users on org_users.org_id = orgs.id
  WhERE org_users.user_id = is_member_of_org.user_id AND
  orgs.id = is_member_of_org.org_id;
  RETURN is_found != 0;
End;
$$;

CREATE FUNCTION "public"."is_owner_of_org"("user_id" uuid, "org_id" uuid) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Declare
 is_found integer;
Begin
  SELECT count(*)
  INTO is_found
  FROM orgs
  WHERE orgs.id = org_id
  AND orgs.created_by = user_id;
  RETURN is_found != 0;
End;
$$;

CREATE FUNCTION "public"."get_org_members"("guild_id" uuid) RETURNS table(aid int8, uid uuid, email character varying, image_url character varying)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  IF NOT (is_owner_of_org(auth.uid(), get_org_members.guild_id) OR check_min_rights('read'::user_min_right, auth.uid(), get_org_members.guild_id, NULL::character varying, NULL::bigint)) THEN
    raise exception 'NO_RIGHTS';
  END IF;

  return query select o.id as aid, users.id as uid, users.email, users.image_url from org_users as o
  join users on users.id = o.user_id
  where o.org_id=get_org_members.guild_id
  AND (is_member_of_org(users.id, o.org_id) OR is_owner_of_org(users.id, o.org_id))
  union all
  select 0 as aid, users.id as uid, users.email, users.image_url from users
  join orgs on orgs.created_by = users.id
  where orgs.id=get_org_members.guild_id;
End;
$$;

CREATE FUNCTION "public"."get_orgs_v2"("userid" "uuid") RETURNS TABLE(gid uuid, created_by uuid, logo text, name text, role varchar)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  return query select o.id as gid, o.created_by, o.logo, o.name, org_users.user_right::varchar from orgs as o
  join org_users on org_users.user_id=get_orgs_v2.userid
  where o.created_by != get_orgs_v2.userid
  union all
  select o.id as gid, o.created_by, o.logo, o.name, 'owner' as "role" from orgs as o
  where o.created_by = get_orgs_v2.userid;
END;  
$$;

CREATE FUNCTION "public"."get_user_main_org_id"("user_id" uuid) RETURNS uuid
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  org_id uuid;
begin
  select orgs.id from orgs
  into org_id
  where orgs.created_by=get_user_main_org_id.user_id
  limit 1;

  return org_id;
End;
$$;

CREATE FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" text) RETURNS uuid
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  org_id uuid;
begin
  select apps.user_id from apps
  into org_id
  where ((apps.app_id)::text = (get_user_main_org_id_by_app_id.app_id)::text)
  limit 1;

  return (select get_user_main_org_id(org_id));
End;
$$;

CREATE OR REPLACE FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT id
  FROM app_versions
  WHERE app_id=appid
  AND name=name_version
  AND user_id=get_user_id(apikey, appid));
End;  
$$;

CREATE OR REPLACE FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM app_versions
  WHERE app_id=appid
  AND name=name_version
  AND user_id=get_user_id(apikey, appid)));
End;  
$$;


CREATE FUNCTION "public"."get_orgs"("userid" "uuid") RETURNS TABLE(id uuid, logo text, name text)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
    SELECT orgs.id, orgs.logo, orgs.name from orgs
    WHERE is_member_of_org(userid, orgs.id) or is_owner_of_org(userid, orgs.id);
END;  
$$;


CREATE FUNCTION "public"."get_user_id"("apikey" "text", "app_id" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Declare  
 org_owner_id uuid;
 real_user_id uuid;
 org_id uuid;
Begin
  SELECT apps.user_id FROM apps WHERE apps.app_id=get_user_id.app_id into org_owner_id;
  SELECT get_user_main_org_id(org_owner_id) INTO org_id;

  -- (public.is_member_of_org(auth.uid(), org_id) OR public.is_owner_of_org(auth.uid(), org_id))
  SELECT user_id
  INTO real_user_id
  FROM apikeys
  WHERE key=apikey;

  IF NOT ((public.is_member_of_org(real_user_id, org_id) OR public.is_owner_of_org(real_user_id, org_id)))
  THEN
    raise exception 'NO_RIGHTS';
  END IF;

  RETURN org_owner_id;
End;  
$$;

CREATE FUNCTION "public"."invite_user_to_org"("email" "varchar", "org_id" "uuid", "invite_type" "public"."user_min_right") RETURNS "varchar"
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

  IF NOT (org.created_by=auth.uid()) THEN
      if NOT (check_min_rights('admin'::user_min_right, auth.uid(), invite_user_to_org.org_id, NULL::character varying, NULL::bigint)) THEN
          return 'NO_RIGHTS';
      END IF;
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

CREATE FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") RETURNS varchar
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Declare  
 invite record;
Begin
  SELECT org_users.* FROM org_users
  INTO invite
  WHERE org_users.org_id=accept_invitation_to_org.org_id and auth.uid()=org_users.user_id;

  IF invite IS NULL THEN
    return 'NO_INVITE';
  else
    IF NOT (invite.user_right::varchar ilike 'invite_'||'%') THEN
      return 'INVALID_ROLE';
    END IF;

    UPDATE org_users
    SET user_right = REPLACE(invite.user_right::varchar, 'invite_', '')::user_min_right
    WHERE org_users.id=invite.id;

    return 'OK';
  end if;
End;
$$;

CREATE FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying, "right" "public"."user_min_right", "user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM apikeys
  WHERE key=apikey
  AND mode=ANY(keymode))) AND (is_app_owner(get_user_id(apikey), app_id) OR check_min_rights(is_allowed_capgkey.right, get_user_id(apikey), get_user_main_org_id(user_id), app_id, NULL::bigint));
End;  
$$;

CREATE FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying, "channel_id" int8, "right" "public"."user_min_right", "user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM apikeys
  WHERE key=apikey
  AND mode=ANY(keymode))) AND (is_app_owner(get_user_id(apikey), app_id) OR check_min_rights(is_allowed_capgkey.right, get_user_id(apikey), get_user_main_org_id(user_id), app_id, "is_allowed_capgkey"."channel_id"));
End;
$$;


CREATE FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN is_allowed_action_user(get_user_id(apikey, appid));
End;
$$;

CREATE OR REPLACE FUNCTION "public"."force_valid_user_id"() RETURNS trigger
   LANGUAGE plpgsql AS
$$BEGIN
    IF NEW."user_id" <> (select user_id from apps where app_id=NEW."app_id") THEN
        RAISE EXCEPTION 'INVALID_USER_ID';
    END IF;

    RETURN NEW;
END;$$;

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

    -- If the user is an admin, we do not care
    IF (is_app_owner(auth.uid(), OLD.app_id) OR is_admin(auth.uid())) THEN
        RETURN NEW;
    END IF;

    -- If the user has the 'admin' role then we do not care
    IF check_min_rights('admin'::user_min_right, auth.uid(), get_user_main_org_id(OLD.created_by), NULL::character varying, NULL::bigint) THEN
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

CREATE OR REPLACE FUNCTION "public"."prevent_steal_org"() RETURNS trigger
   LANGUAGE plpgsql AS
$$BEGIN
   IF NEW.created_by IS DISTINCT FROM OLD.created_by
   THEN
      RAISE EXCEPTION '"created_by" must not be updated';
   END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
   THEN
      RAISE EXCEPTION '"id" must not be updated';
   END IF;

   RETURN NEW;
END;$$;

CREATE TRIGGER noupdate
   BEFORE UPDATE ON "public"."channels" FOR EACH ROW
   EXECUTE PROCEDURE "public"."noupdate"();

CREATE TRIGGER force_valid_user_id
   BEFORE INSERT ON "public"."app_versions" FOR EACH ROW
   EXECUTE PROCEDURE "public"."force_valid_user_id"();

CREATE TRIGGER prevent_steal_org
   BEFORE UPDATE ON "public"."orgs" FOR EACH ROW
   EXECUTE PROCEDURE "public"."prevent_steal_org"();

CREATE OR REPLACE FUNCTION "public"."is_onboarded"() RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN is_onboarded(auth.uid());
End;
$$;

ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "orgs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;

DROP POLICY "Allow apikey to select" ON "public"."app_versions";
CREATE POLICY "Allow apikey to select" ON "public"."app_versions" FOR SELECT TO "anon" USING (("public"."is_allowed_capgkey"((("current_setting"('request.headers'::text, true))::json ->> 'capgkey'::text), '{read,all}'::"public"."key_mode"[], "app_id") OR "public"."is_allowed_capgkey"((("current_setting"('request.headers'::text, true))::json ->> 'capgkey'::text), '{read,all}'::"public"."key_mode"[], "app_id", 'read'::"public"."user_min_right", "user_id")));

CREATE POLICY "Allow org admin to update (name and logo)" ON "public"."orgs" FOR UPDATE TO "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "auth"."uid"(), "id", NULL::character varying, NULL::bigint)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "auth"."uid"(), "id", NULL::character varying, NULL::bigint));

CREATE POLICY "Allow org member (write) to update" ON "public"."app_versions" FOR UPDATE TO "authenticated" USING ("public"."check_min_rights"('write'::"public"."user_min_right", "auth"."uid"(), "public"."get_user_main_org_id"(user_id), NULL::character varying, NULL::bigint)) WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "auth"."uid"(), "public"."get_user_main_org_id"(user_id), NULL::character varying, NULL::bigint));

CREATE POLICY "Allow org member (write) to insert" ON "public"."devices_override" FOR INSERT TO "authenticated" WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "auth"."uid"(), "public"."get_user_main_org_id_by_app_id"(app_id), app_id, NULL::bigint));

CREATE POLICY "Allow org member (write) to delete" ON "public"."devices_override" FOR DELETE TO "authenticated" USING ("public"."check_min_rights"('write'::"public"."user_min_right", "auth"."uid"(), "public"."get_user_main_org_id_by_app_id"(app_id), app_id, NULL::bigint));

CREATE POLICY "Allow org member to read" ON "public"."devices_override" FOR SELECT TO "authenticated" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "auth"."uid"(), "public"."get_user_main_org_id_by_app_id"(app_id), app_id, NULL::bigint));

CREATE POLICY "Allow org member (write) to insert" ON "public"."channel_devices" FOR INSERT TO "authenticated" WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "auth"."uid"(), "public"."get_user_main_org_id_by_app_id"(app_id), app_id, NULL::bigint));

CREATE POLICY "Allow org member (write) to delete" ON "public"."channel_devices" FOR DELETE TO "authenticated" USING ("public"."check_min_rights"('write'::"public"."user_min_right", "auth"."uid"(), "public"."get_user_main_org_id_by_app_id"(app_id), app_id, NULL::bigint));

CREATE POLICY "Allow org member to read" ON "public"."channel_devices" FOR SELECT TO "authenticated" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "auth"."uid"(), "public"."get_user_main_org_id_by_app_id"(app_id), app_id, NULL::bigint));

DROP POLICY "Allow owner to all" ON "public"."orgs";
CREATE POLICY "Allow owner to all" ON "public"."orgs" TO "authenticated" USING ("auth"."uid"() = created_by) WITH CHECK ("auth"."uid"() = created_by);

CREATE POLICY "Allow memeber and owner to select" ON "public"."org_users"
AS PERMISSIVE FOR SELECT
TO public
USING ((public.is_member_of_org(auth.uid(), org_id) OR public.is_owner_of_org(auth.uid(), org_id)));

CREATE POLICY "Allow to self delete" ON "public"."org_users"
AS PERMISSIVE FOR DELETE
TO public
USING ((user_id=auth.uid()));

CREATE POLICY "Allow org member to select" ON "public"."apps"
AS PERMISSIVE FOR SELECT
TO authenticated
USING (public.check_min_rights('read'::"public"."user_min_right", auth.uid(), public.get_user_main_org_id(user_id), NULL::character varying, NULL::bigint));

CREATE POLICY "Allow member or owner to select" ON "public"."orgs"
AS PERMISSIVE FOR SELECT
TO authenticated
USING (public.is_member_of_org(auth.uid(), id) OR public.is_owner_of_org(auth.uid(), id));

CREATE POLICY "Allow org members to select" ON "public"."channels"
AS PERMISSIVE FOR SELECT
TO authenticated
USING ("public"."check_min_rights"('read'::"public"."user_min_right", auth.uid(), "public"."get_user_main_org_id"(created_by), NULL::character varying, NULL::bigint));

CREATE POLICY "Allow org members to select" ON "public"."app_versions"
AS PERMISSIVE FOR SELECT
TO authenticated
USING ("public"."check_min_rights"('read'::"public"."user_min_right", auth.uid(), "public"."get_user_main_org_id"(user_id), app_id, NULL::bigint));

CREATE POLICY "Allow org admins to edit" ON "public"."channels"
AS PERMISSIVE FOR UPDATE
TO authenticated
USING ("public"."check_min_rights"('admin'::"public"."user_min_right", auth.uid(), "public"."get_user_main_org_id"(created_by), NULL::character varying, NULL::bigint))
WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", auth.uid(), "public"."get_user_main_org_id"(created_by), NULL::character varying, NULL::bigint));

CREATE POLICY "Allow org admins to insert" ON "public"."channels"
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", auth.uid(), "public"."get_user_main_org_id"(created_by), NULL::character varying, NULL::bigint));

-- CREATE POLICY "Allow org member to select " ON "public"."app_stats"
-- AS PERMISSIVE FOR SELECT
-- TO authenticated
-- USING ("public"."check_min_rights"('read'::"public"."user_min_right", auth.uid(), "public"."get_user_main_org_id"(user_id), app_id, NULL::bigint));

CREATE POLICY "Allow org members to select" ON "public"."devices"
AS PERMISSIVE FOR SELECT
TO public
USING ("public"."check_min_rights"('read'::"public"."user_min_right", auth.uid(), "public"."get_user_main_org_id_by_app_id"(app_id::TEXT), app_id, NULL::bigint));

CREATE POLICY "Allow org members to select" ON "public"."app_usage"
AS PERMISSIVE FOR SELECT
TO public
USING ("public"."check_min_rights"('read'::"public"."user_min_right", auth.uid(), "public"."get_user_main_org_id_by_app_id"(app_id::TEXT), app_id, NULL::bigint));

CREATE POLICY "Allow org members to select" ON "public"."app_versions_meta"
AS PERMISSIVE FOR SELECT
TO public
USING ("public"."check_min_rights"('read'::"public"."user_min_right", auth.uid(), "public"."get_user_main_org_id_by_app_id"(app_id::TEXT), app_id, NULL::bigint));

CREATE POLICY "Allow org owner to all" ON "public"."org_users"
AS PERMISSIVE FOR ALL
TO authenticated
USING ("public"."is_owner_of_org"(auth.uid(), org_id))
WITH CHECK ("public"."is_owner_of_org"(auth.uid(), org_id));

CREATE POLICY "Allow org member's API key to select" ON "public"."apps"
AS PERMISSIVE FOR SELECT
TO anon
USING ("public"."is_allowed_capgkey"(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{all,write,read}'::"public"."key_mode"[], app_id, 'read'::"public"."user_min_right", user_id));

CREATE POLICY "Allow org member's api key to select" ON "public"."channels"
AS PERMISSIVE FOR SELECT
TO anon
USING ("public"."is_allowed_capgkey"(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{read, upload, write, all}'::"public"."key_mode"[], app_id, channels.id, 'read'::"public"."user_min_right", created_by));

CREATE POLICY "Allow org member's apikey to insert" ON "public"."app_versions"
AS PERMISSIVE FOR INSERT
TO anon
WITH CHECK (("public"."is_allowed_capgkey"(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{upload,write,all}'::"public"."key_mode"[], app_id, NULL::bigint, 'upload'::"public"."user_min_right", user_id) AND "public"."is_allowed_action"(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), app_id)));

CREATE POLICY "Allow org member's apikey to update" ON "public"."app_versions"
AS PERMISSIVE FOR UPDATE
TO anon
USING (("public"."is_allowed_capgkey"(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{upload,write,all}'::"public"."key_mode"[], app_id, NULL::bigint, 'upload'::"public"."user_min_right", user_id) AND "public"."is_allowed_action"(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), app_id)))
WITH CHECK (("public"."is_allowed_capgkey"(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{upload,write,all}'::"public"."key_mode"[], app_id, NULL::bigint, 'upload'::"public"."user_min_right", user_id) AND "public"."is_allowed_action"(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), app_id)));

CREATE POLICY "Allow org member's api key to update" ON "public"."channels"
AS PERMISSIVE FOR UPDATE
TO anon
USING (("public"."is_allowed_capgkey"(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{upload,write,all}'::"public"."key_mode"[], app_id, NULL::bigint, 'write'::"public"."user_min_right", created_by) AND "public"."is_allowed_action"(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), app_id)))
WITH CHECK (("public"."is_allowed_capgkey"(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{upload,write,all}'::"public"."key_mode"[], app_id, NULL::bigint, 'write'::"public"."user_min_right", created_by) AND "public"."is_allowed_action"(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), app_id)));

DROP POLICY "Enable all for user based on user_id" ON "public"."apikeys";
CREATE POLICY "Enable all for user based on user_id" ON "public"."apikeys" FOR ALL TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."is_admin"("auth"."uid"()))) WITH CHECK ((("auth"."uid"() = "user_id") OR "public"."is_admin"("auth"."uid"())));

GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "service_role";

REVOKE EXECUTE ON FUNCTION "public"."get_user_main_org_id"("user_id" uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_user_main_org_id"("user_id" uuid) TO anon;
GRANT EXECUTE ON FUNCTION "public"."get_user_main_org_id"("user_id" uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION "public"."get_user_main_org_id"("user_id" uuid) TO postgres;

GRANT ALL ON FUNCTION "public"."get_org_members"("guild_id" uuid) TO "postgres";
GRANT ALL ON FUNCTION "public"."get_org_members"("guild_id" uuid) TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_members"("guild_id" uuid) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_members"("guild_id" uuid) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_orgs"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."get_orgs"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_orgs"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_orgs"("userid" "uuid") TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO anon;
GRANT EXECUTE ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO authenticated;


-- Minor change over base.sql. this versions returns "bigint"
CREATE OR REPLACE FUNCTION public.http_post_helper(function_name text, function_type text, body jsonb) 
RETURNS bigint 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $BODY$
DECLARE 
  request_id text;
  url text;
BEGIN 
  -- Determine the URL based on the function_type
  IF function_type = 'external' THEN
    url := get_external_function_url() || function_name;
  ELSE
    url := get_db_url() || '/functions/v1/' || function_name;
  END IF;

  -- Make an async HTTP POST request using pg_net
  SELECT INTO request_id net.http_post(
    url := url,
    headers := jsonb_build_object(
      'Content-Type',
      'application/json',
      'apisecret',
      get_apikey()
    ),
    body := body,
    timeout_milliseconds := 15000
  );
  return request_id;
END;
$BODY$;