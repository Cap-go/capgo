DROP FUNCTION "public"."get_org_members"("guild_id" "uuid");

CREATE OR REPLACE FUNCTION "public"."get_org_members"(user_id "uuid", "guild_id" "uuid") RETURNS TABLE("aid" bigint, "uid" "uuid", "email" character varying, "image_url" character varying, "role" "public"."user_min_right")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  return query select o.id as aid, users.id as uid, users.email, users.image_url, o.user_right as role from org_users as o
  join users on users.id = o.user_id
  where o.org_id=get_org_members.guild_id
  AND (is_member_of_org(users.id, o.org_id) OR is_owner_of_org(users.id, o.org_id));
End;
$$;

ALTER FUNCTION "public"."get_org_members"(user_id "uuid", "guild_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_org_members"(user_id "uuid", "guild_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_org_members"(user_id "uuid", "guild_id" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."get_org_members"("guild_id" "uuid") RETURNS TABLE("aid" bigint, "uid" "uuid", "email" character varying, "image_url" character varying, "role" "public"."user_min_right")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  IF NOT (is_owner_of_org((select auth.uid()), get_org_members.guild_id) OR check_min_rights('read'::user_min_right, (select auth.uid()), get_org_members.guild_id, NULL::character varying, NULL::bigint)) THEN
    raise exception 'NO_RIGHTS';
  END IF;

  return query select * from get_org_members((select auth.uid()), get_org_members.guild_id);
End;
$$;
ALTER FUNCTION "public"."get_org_members"("guild_id" "uuid") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."get_org_members"("guild_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_members"("guild_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_members"("guild_id" "uuid") TO "service_role";
