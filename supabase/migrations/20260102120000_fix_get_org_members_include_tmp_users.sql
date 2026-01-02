-- Fix get_org_members to include tmp_users (pending invitations)
-- This was a regression from migration 20250913161225_lint_warning_fixes_followup.sql
-- which removed the UNION with tmp_users table

DROP FUNCTION IF EXISTS public.get_org_members (uuid, uuid);

CREATE FUNCTION "public"."get_org_members" ("user_id" uuid, "guild_id" uuid) RETURNS TABLE (
  "aid" bigint,
  "uid" uuid,
  "email" varchar,
  "image_url" varchar,
  "role" public.user_min_right,
  "is_tmp" boolean
) LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
BEGIN
  PERFORM user_id;
  RETURN QUERY
    -- Get existing org members
    SELECT o.id AS aid, users.id AS uid, users.email, users.image_url, o.user_right AS role, false AS is_tmp
    FROM public.org_users o
    JOIN public.users ON users.id = o.user_id
    WHERE o.org_id = get_org_members.guild_id
    AND public.is_member_of_org(users.id, o.org_id)
  UNION
    -- Get pending invitations from tmp_users
    SELECT
      ((SELECT COALESCE(MAX(id), 0) FROM public.org_users) + tmp.id)::bigint AS aid,
      tmp.future_uuid AS uid,
      tmp.email::varchar,
      ''::varchar AS image_url,
      public.transform_role_to_invite(tmp.role) AS role,
      true AS is_tmp
    FROM public.tmp_users tmp
    WHERE tmp.org_id = get_org_members.guild_id
    AND tmp.cancelled_at IS NULL
    AND tmp.created_at > (CURRENT_TIMESTAMP - INTERVAL '7 days');
END;
$$;
