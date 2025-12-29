-- Update get_org_members to support API key authentication
-- Previously used auth.uid() which only works with JWT authentication
-- Now uses get_identity() which supports both JWT and API key authentication

CREATE OR REPLACE FUNCTION "public"."get_org_members" ("guild_id" "uuid") RETURNS TABLE (
  "aid" bigint,
  "uid" "uuid",
  "email" character varying,
  "image_url" character varying,
  "role" "public"."user_min_right",
  "is_tmp" boolean
) LANGUAGE "plpgsql" SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Get user ID supporting both JWT and API key authentication
  v_user_id := public.get_identity('{read,upload,write,all}'::public.key_mode[]);

  IF NOT (public.check_min_rights('read'::public.user_min_right, v_user_id, get_org_members.guild_id, NULL::character varying, NULL::bigint)) THEN
    PERFORM public.pg_log('deny: NO_RIGHTS', jsonb_build_object('guild_id', get_org_members.guild_id, 'uid', v_user_id));
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  RETURN QUERY SELECT * FROM public.get_org_members(v_user_id, get_org_members.guild_id);
END;
$$;

-- Revoke public access to inner function to prevent bypassing authorization
-- The inner function should only be called by the wrapper or service_role
REVOKE ALL ON FUNCTION "public"."get_org_members" ("user_id" uuid, "guild_id" uuid) FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_org_members" ("user_id" uuid, "guild_id" uuid) FROM "authenticated";

