-- Create tmp_users table
CREATE TABLE public.tmp_users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    org_id UUID NOT NULL REFERENCES public.orgs(id),
    role user_min_right NOT NULL,
    invite_magic_string TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    future_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
    rescinded BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create unique index on both org_id and email
CREATE UNIQUE INDEX tmp_users_org_id_email_idx ON public.tmp_users (org_id, email);

-- Add trigger for automatically updating updated_at
CREATE TRIGGER handle_updated_at
BEFORE UPDATE ON public.tmp_users
FOR EACH ROW
EXECUTE FUNCTION moddatetime('updated_at');

-- Enable Row Level Security
ALTER TABLE public.tmp_users ENABLE ROW LEVEL SECURITY;

-- No RLS policies are added as per requirements


-- Modify get_members. We will not create a new function, but will modify the existing one to support the new tmp_users table.
DROP FUNCTION "public"."get_org_members"("guild_id" "uuid");

CREATE OR REPLACE FUNCTION "public"."get_org_members"(user_id "uuid", "guild_id" "uuid") RETURNS TABLE("aid" bigint, "uid" "uuid", "email" character varying, "image_url" character varying, "role" "public"."user_min_right")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  return query select o.id as aid, users.id as uid, users.email, users.image_url, o.user_right as role from org_users as o
  join users on users.id = o.user_id
  where o.org_id=get_org_members.guild_id
  AND (is_member_of_org(users.id, o.org_id))
  UNION
  select ((select max(id) from org_users) + tmp.id) as aid, tmp.future_uuid as uid, tmp.email, '' as image_url, tmp.role from tmp_users as tmp
  where tmp.org_id=get_org_members.guild_id;
End;
$$;

ALTER FUNCTION "public"."get_org_members"(user_id "uuid", "guild_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_org_members"(user_id "uuid", "guild_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_org_members"(user_id "uuid", "guild_id" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."get_org_members"("guild_id" "uuid") RETURNS TABLE("aid" bigint, "uid" "uuid", "email" character varying, "image_url" character varying, "role" "public"."user_min_right")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  IF NOT (check_min_rights('read'::user_min_right, (select auth.uid()), get_org_members.guild_id, NULL::character varying, NULL::bigint)) THEN
    raise exception 'NO_RIGHTS';
  END IF;

  return query select * from get_org_members((select auth.uid()), get_org_members.guild_id);
End;
$$;
ALTER FUNCTION "public"."get_org_members"("guild_id" "uuid") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."get_org_members"("guild_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_members"("guild_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_members"("guild_id" "uuid") TO "service_role";

