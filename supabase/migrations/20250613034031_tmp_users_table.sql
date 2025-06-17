-- Create tmp_users table
CREATE TABLE public.tmp_users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  org_id UUID NOT NULL REFERENCES public.orgs (id),
  role user_min_right NOT NULL,
  invite_magic_string TEXT NOT NULL DEFAULT encode(gen_random_bytes (128), 'hex')::text,
  future_uuid UUID NOT NULL DEFAULT gen_random_uuid (),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  -- I call it cancelled_at, but it's a dumified name for rescinded_at
  cancelled_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create unique index on both org_id and email
CREATE UNIQUE INDEX tmp_users_org_id_email_idx ON public.tmp_users (org_id, email);

-- Create index on invite_magic_string for faster lookups
CREATE INDEX tmp_users_invite_magic_string_idx ON public.tmp_users (invite_magic_string);

-- Add trigger for automatically updating updated_at
CREATE TRIGGER handle_updated_at BEFORE
UPDATE ON public.tmp_users FOR EACH ROW
EXECUTE FUNCTION moddatetime ('updated_at');

-- Enable Row Level Security
ALTER TABLE public.tmp_users ENABLE ROW LEVEL SECURITY;

-- No RLS policies are added as per requirements
-- Function to transform role to invite_role
CREATE OR REPLACE FUNCTION public.transform_role_to_invite (role_input public.user_min_right) RETURNS public.user_min_right LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = 'public' AS $$
BEGIN
  CASE role_input
    WHEN 'read'::public.user_min_right THEN RETURN 'invite_read'::public.user_min_right;
    WHEN 'upload'::public.user_min_right THEN RETURN 'invite_upload'::public.user_min_right;
    WHEN 'write'::public.user_min_right THEN RETURN 'invite_write'::public.user_min_right;
    WHEN 'admin'::public.user_min_right THEN RETURN 'invite_admin'::public.user_min_right;
    WHEN 'super_admin'::public.user_min_right THEN RETURN 'invite_super_admin'::public.user_min_right;
    ELSE RETURN role_input; -- If it's already an invite role or unrecognized, return as is
  END CASE;
END;
$$;

-- Grant privileges for the function
ALTER FUNCTION public.transform_role_to_invite (user_min_right) OWNER TO postgres;

GRANT ALL ON FUNCTION public.transform_role_to_invite (user_min_right) TO service_role;

GRANT
EXECUTE ON FUNCTION public.transform_role_to_invite (user_min_right) TO authenticated;

-- Modify get_members. We will not create a new function, but will modify the existing one to support the new tmp_users table.
DROP FUNCTION "public"."get_org_members" ("guild_id" "uuid");

DROP FUNCTION "public"."get_org_members" (user_id "uuid", "guild_id" "uuid");

CREATE OR REPLACE FUNCTION "public"."get_org_members" (user_id "uuid", "guild_id" "uuid") RETURNS TABLE (
  "aid" bigint,
  "uid" "uuid",
  "email" character varying,
  "image_url" character varying,
  "role" "public"."user_min_right",
  "is_tmp" boolean
) LANGUAGE "plpgsql" SECURITY DEFINER
SET
  search_path = 'public' AS $$
begin
  return query select o.id as aid, users.id as uid, users.email, users.image_url, o.user_right as role, false as is_tmp from org_users as o
  join users on users.id = o.user_id
  where o.org_id=get_org_members.guild_id
  AND (public.is_member_of_org(users.id, o.org_id))
  UNION
  select ((select max(id) from org_users) + tmp.id) as aid, tmp.future_uuid as uid, tmp.email, '' as image_url, public.transform_role_to_invite(tmp.role) as role, true as is_tmp from tmp_users as tmp
  where tmp.org_id=get_org_members.guild_id
  AND tmp.cancelled_at IS NULL
  AND tmp.created_at > (CURRENT_TIMESTAMP - INTERVAL '7 days');
End;
$$;

ALTER FUNCTION "public"."get_org_members" (user_id "uuid", "guild_id" "uuid") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_org_members" (user_id "uuid", "guild_id" "uuid")
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."get_org_members" (user_id "uuid", "guild_id" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."get_org_members" ("guild_id" "uuid") RETURNS TABLE (
  "aid" bigint,
  "uid" "uuid",
  "email" character varying,
  "image_url" character varying,
  "role" "public"."user_min_right",
  "is_tmp" boolean
) LANGUAGE "plpgsql" SECURITY DEFINER
SET
  search_path = 'public' AS $$
begin
  IF NOT (public.check_min_rights('read'::public.user_min_right, (select auth.uid()), get_org_members.guild_id, NULL::character varying, NULL::bigint)) THEN
    raise exception 'NO_RIGHTS';
  END IF;

  return query select * from public.get_org_members((select auth.uid()), get_org_members.guild_id);
End;
$$;

ALTER FUNCTION "public"."get_org_members" ("guild_id" "uuid") OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."get_org_members" ("guild_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."get_org_members" ("guild_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_org_members" ("guild_id" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."invite_user_to_org" (
  "email" character varying,
  "org_id" "uuid",
  "invite_type" "public"."user_min_right"
) RETURNS character varying LANGUAGE "plpgsql" SECURITY DEFINER
SET
  search_path = 'public' AS $$
Declare  
  org record;
  invited_user record;
  current_record record;
  current_tmp_user record;
Begin
  SELECT * FROM public.orgs
  INTO org
  WHERE public.orgs.id=invite_user_to_org.org_id;

  IF org IS NULL THEN
    return 'NO_ORG';
  END IF;

  if NOT (public.check_min_rights('admin'::public.user_min_right, (select public.get_identity_org_allowed('{read,upload,write,all}'::"public"."key_mode"[], invite_user_to_org.org_id)), invite_user_to_org.org_id, NULL::character varying, NULL::bigint)) THEN
    return 'NO_RIGHTS';
  END IF;


  if NOT (public.check_min_rights('super_admin'::public.user_min_right, (select public.get_identity_org_allowed('{read,upload,write,all}'::"public"."key_mode"[], invite_user_to_org.org_id)), invite_user_to_org.org_id, NULL::character varying, NULL::bigint) AND (invite_type is distinct from 'super_admin'::"public"."user_min_right" or invite_type is distinct from 'invite_super_admin'::"public"."user_min_right")) THEN
    return 'NO_RIGHTS';
  END IF;

  SELECT public.users.id FROM public.users
  INTO invited_user
  WHERE public.users.email=invite_user_to_org.email;

  IF FOUND THEN
    -- INSERT INTO org_users (user_id, org_id, user_right)
    -- VALUES (invited_user.id, invite_user_to_org.org_id, invite_type);

    SELECT public.org_users.id from public.org_users 
    INTO current_record
    WHERE public.org_users.user_id=invited_user.id
    AND public.org_users.org_id=invite_user_to_org.org_id;

    IF FOUND THEN
      RETURN 'ALREADY_INVITED';
    ELSE
      INSERT INTO public.org_users (user_id, org_id, user_right)
      VALUES (invited_user.id, invite_user_to_org.org_id, invite_type);

      RETURN 'OK';
    END IF;
  ELSE
    SELECT * FROM public.tmp_users
    INTO current_tmp_user
    WHERE public.tmp_users.email=invite_user_to_org.email
    AND public.tmp_users.org_id=invite_user_to_org.org_id;

    IF FOUND THEN
      IF current_tmp_user.cancelled_at IS NOT NULL THEN
        -- Check if cancelled less than 3 hours ago
        IF current_tmp_user.cancelled_at > (CURRENT_TIMESTAMP - INTERVAL '3 hours') THEN
          RETURN 'TOO_RECENT_INVITATION_CANCELATION';
        ELSE
          RETURN 'NO_EMAIL'; -- Allow reinvitation after 3 hours
        END IF;
      ELSE
        RETURN 'ALREADY_INVITED';
      END IF;
    ELSE
      return 'NO_EMAIL'; -- This is expected. the frontend expects this response.
    END IF;

    return 'NO_EMAIL';
  END IF;
End;
$$;

-- Function to rescind an invitation to an organization
CREATE OR REPLACE FUNCTION "public"."rescind_invitation" ("email" TEXT, "org_id" UUID) RETURNS character varying LANGUAGE "plpgsql" SECURITY DEFINER AS $$
DECLARE
  tmp_user record;
  org record;
BEGIN
  -- Check if org exists
  SELECT * FROM public.orgs
  INTO org
  WHERE public.orgs.id = rescind_invitation.org_id;

  IF NOT FOUND THEN
    RETURN 'NO_ORG';
  END IF;

  -- Check if user has admin rights
  IF NOT (public.check_min_rights('admin'::public.user_min_right, (select public.get_identity_org_allowed('{read,upload,write,all}'::"public"."key_mode"[], rescind_invitation.org_id)), rescind_invitation.org_id, NULL::character varying, NULL::bigint)) THEN
    RETURN 'NO_RIGHTS';
  END IF;

  -- Find the temporary user
  SELECT * FROM public.tmp_users
  INTO tmp_user
  WHERE public.tmp_users.email = rescind_invitation.email
  AND public.tmp_users.org_id = rescind_invitation.org_id;

  IF NOT FOUND THEN
    RETURN 'NO_INVITATION';
  END IF;

  -- Check if already cancelled
  IF tmp_user.cancelled_at IS NOT NULL THEN
    RETURN 'ALREADY_CANCELLED';
  END IF;

  -- Update the cancelled_at field
  UPDATE public.tmp_users
  SET cancelled_at = CURRENT_TIMESTAMP
  WHERE public.tmp_users.id = tmp_user.id;

  RETURN 'OK';
END;
$$;

-- Grant privileges
ALTER FUNCTION "public"."rescind_invitation" (TEXT, UUID) OWNER TO postgres;

GRANT ALL ON FUNCTION "public"."rescind_invitation" (TEXT, UUID) TO service_role;

GRANT
EXECUTE ON FUNCTION "public"."rescind_invitation" (TEXT, UUID) TO authenticated;

-- Function to transform invite_role to regular role
CREATE OR REPLACE FUNCTION public.transform_role_to_non_invite (role_input public.user_min_right) RETURNS public.user_min_right LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = 'public' AS $$
BEGIN
  CASE role_input
    WHEN 'invite_read'::public.user_min_right THEN RETURN 'read'::public.user_min_right;
    WHEN 'invite_upload'::public.user_min_right THEN RETURN 'upload'::public.user_min_right;
    WHEN 'invite_write'::public.user_min_right THEN RETURN 'write'::public.user_min_right;
    WHEN 'invite_admin'::public.user_min_right THEN RETURN 'admin'::public.user_min_right;
    WHEN 'invite_super_admin'::public.user_min_right THEN RETURN 'super_admin'::public.user_min_right;
    ELSE RETURN role_input; -- If it's already a non-invite role or unrecognized, return as is
  END CASE;
END;
$$;

-- Grant privileges for the function
ALTER FUNCTION public.transform_role_to_non_invite (user_min_right) OWNER TO postgres;

GRANT ALL ON FUNCTION public.transform_role_to_non_invite (user_min_right) TO service_role;

GRANT
EXECUTE ON FUNCTION public.transform_role_to_non_invite (user_min_right) TO authenticated;

-- Function to modify permissions for a temporary user
CREATE OR REPLACE FUNCTION "public"."modify_permissions_tmp" (
  "email" TEXT,
  "org_id" UUID,
  "new_role" "public"."user_min_right"
) RETURNS character varying LANGUAGE "plpgsql" SECURITY DEFINER
SET
  search_path = 'public' AS $$
DECLARE
  tmp_user record;
  org record;
  non_invite_role user_min_right;
BEGIN
  -- Convert the role to non-invite format for permission checks
  non_invite_role := transform_role_to_non_invite(new_role);

  -- Check if org exists
  SELECT * FROM public.orgs
  INTO org
  WHERE public.orgs.id = modify_permissions_tmp.org_id;

  IF NOT FOUND THEN
    RETURN 'NO_ORG';
  END IF;

  -- Check if user has admin rights
  IF NOT (public.check_min_rights('admin'::public.user_min_right, (select public.get_identity_org_allowed('{read,upload,write,all}'::"public"."key_mode"[], modify_permissions_tmp.org_id)), modify_permissions_tmp.org_id, NULL::character varying, NULL::bigint)) THEN
    RETURN 'NO_RIGHTS';
  END IF;
  
  -- Special permission check for super_admin roles
  IF (non_invite_role = 'super_admin'::public.user_min_right) THEN
    IF NOT (public.check_min_rights('super_admin'::public.user_min_right, (select public.get_identity_org_allowed('{read,upload,write,all}'::"public"."key_mode"[], modify_permissions_tmp.org_id)), modify_permissions_tmp.org_id, NULL::character varying, NULL::bigint)) THEN
      RETURN 'NO_RIGHTS_FOR_SUPER_ADMIN';
    END IF;
  END IF;

  -- Find the temporary user
  SELECT * FROM public.tmp_users
  INTO tmp_user
  WHERE public.tmp_users.email = modify_permissions_tmp.email
  AND public.tmp_users.org_id = modify_permissions_tmp.org_id;

  IF NOT FOUND THEN
    RETURN 'NO_INVITATION';
  END IF;

  -- Check if invitation has been cancelled
  IF tmp_user.cancelled_at IS NOT NULL THEN
    RETURN 'INVITATION_CANCELLED';
  END IF;

  -- Make sure we store the non-invite role (we store the raw roles in tmp_users)
  UPDATE public.tmp_users
  SET role = non_invite_role,
      updated_at = CURRENT_TIMESTAMP
  WHERE public.tmp_users.id = tmp_user.id;

  RETURN 'OK';
END;
$$;

-- Grant privileges
ALTER FUNCTION "public"."modify_permissions_tmp" (TEXT, UUID, "public"."user_min_right") OWNER TO postgres;

GRANT ALL ON FUNCTION "public"."modify_permissions_tmp" (TEXT, UUID, "public"."user_min_right") TO service_role;

GRANT
EXECUTE ON FUNCTION "public"."modify_permissions_tmp" (TEXT, UUID, "public"."user_min_right") TO authenticated;

-- Function to get invite by magic string lookup
CREATE OR REPLACE FUNCTION "public"."get_invite_by_magic_lookup" ("lookup" TEXT) RETURNS TABLE (
  org_name TEXT,
  org_logo TEXT,
  role public.user_min_right
) LANGUAGE "plpgsql" SECURITY DEFINER
SET
  search_path = 'public' AS $$
BEGIN
  RETURN QUERY 
  SELECT 
    o.name AS org_name,
    o.logo AS org_logo,
    tmp.role
  FROM public.tmp_users tmp
  JOIN public.orgs o ON tmp.org_id = o.id
  WHERE tmp.invite_magic_string = get_invite_by_magic_lookup.lookup
  AND tmp.cancelled_at IS NULL
  AND tmp.created_at > (CURRENT_TIMESTAMP - INTERVAL '7 days');
END;
$$;

-- Grant privileges
ALTER FUNCTION "public"."get_invite_by_magic_lookup" (TEXT) OWNER TO postgres;

GRANT ALL ON FUNCTION "public"."get_invite_by_magic_lookup" (TEXT) TO service_role;

GRANT
EXECUTE ON FUNCTION "public"."get_invite_by_magic_lookup" (TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION "public"."check_org_user_privilages" () RETURNS "trigger" LANGUAGE "plpgsql"
SET
  search_path = 'public' AS $$BEGIN
  
  -- here we check if the user is a service role in order to bypass this permission check
  IF (((SELECT auth.jwt() ->> 'role')='service_role') OR ((select current_user) IS NOT DISTINCT FROM 'postgres')) THEN
    RETURN NEW;
  END IF;
  
  IF ("public"."check_min_rights"('super_admin'::"public"."user_min_right", (select auth.uid()), NEW.org_id, NULL::character varying, NULL::bigint))
  THEN
    RETURN NEW;
  END IF;

  IF NEW.user_right IS NOT DISTINCT FROM 'super_admin'::"public"."user_min_right"
  THEN
    RAISE EXCEPTION 'Admins cannot elevate privilages!';
  END IF;

  IF NEW.user_right IS NOT DISTINCT FROM 'invite_super_admin'::"public"."user_min_right"
  THEN
    RAISE EXCEPTION 'Admins cannot elevate privilages!';
  END IF;

  RETURN NEW;
END;$$;
