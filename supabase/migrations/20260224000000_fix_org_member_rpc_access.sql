-- ============================================================================
-- Fix auth checks and execution privileges for org RPCs
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."get_org_members" ("guild_id" "uuid") RETURNS TABLE (
    "aid" bigint,
    "uid" "uuid",
    "email" "varchar",
    "image_url" "varchar",
    "role" "public"."user_min_right",
    "is_tmp" boolean
) LANGUAGE plpgsql SECURITY DEFINER
SET
search_path = '' AS $$
DECLARE
  v_user_id uuid;
  v_is_service_role boolean;
BEGIN
  v_user_id := public.get_identity('{read,upload,write,all}'::public.key_mode[]);
  v_is_service_role := (
    ((SELECT auth.jwt() ->> 'role') = 'service_role')
    OR ((SELECT session_user) IS NOT DISTINCT FROM 'postgres')
  );

  IF NOT v_is_service_role THEN
    IF v_user_id IS NULL OR NOT public.check_min_rights(
      'read'::public.user_min_right,
      v_user_id,
      get_org_members.guild_id,
      NULL::character varying,
      NULL::bigint
    ) THEN
      PERFORM public.pg_log('deny: NO_RIGHTS', jsonb_build_object('guild_id', get_org_members.guild_id, 'uid', v_user_id));
      RAISE EXCEPTION 'NO_RIGHTS';
    END IF;
  END IF;

  RETURN QUERY SELECT * FROM public.get_org_members(v_user_id, get_org_members.guild_id);
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_org_members" (
    "user_id" uuid,
    "guild_id" uuid
) RETURNS TABLE (
    aid bigint,
    uid uuid,
    email varchar,
    image_url varchar,
    role public.user_min_right,
    is_tmp boolean
) LANGUAGE plpgsql SECURITY DEFINER
SET
search_path = '' AS $$
DECLARE
  v_user_id uuid;
  v_is_service_role boolean;
BEGIN
  v_is_service_role := (
    ((SELECT auth.jwt() ->> 'role') = 'service_role')
    OR ((SELECT session_user) IS NOT DISTINCT FROM 'postgres')
  );

  IF NOT v_is_service_role THEN
    v_user_id := public.get_identity('{read,upload,write,all}'::public.key_mode[]);
    IF v_user_id IS NULL OR v_user_id IS DISTINCT FROM get_org_members.user_id THEN
      PERFORM public.pg_log('deny: NO_RIGHTS', jsonb_build_object('guild_id', get_org_members.guild_id, 'uid', v_user_id, 'requested_uid', get_org_members.user_id));
      RAISE EXCEPTION 'NO_RIGHTS';
    END IF;

    IF NOT public.check_min_rights(
      'read'::public.user_min_right,
      v_user_id,
      get_org_members.guild_id,
      NULL::character varying,
      NULL::bigint
    ) THEN
      PERFORM public.pg_log('deny: NO_RIGHTS', jsonb_build_object('guild_id', get_org_members.guild_id, 'uid', v_user_id));
      RAISE EXCEPTION 'NO_RIGHTS';
    END IF;
  END IF;

  RETURN QUERY
    -- Get existing org members
    SELECT o.id AS aid, users.id AS uid, users.email, users.image_url, o.user_right AS role, false AS is_tmp
    FROM public.org_users o
    JOIN public.users ON users.id = o.user_id
    WHERE o.org_id = get_org_members.guild_id
  UNION
    -- Get pending invitations from tmp_users
    SELECT
      (-tmp.id)::bigint AS aid,
      tmp.future_uuid AS uid,
      tmp.email::varchar,
      ''::varchar AS image_url,
      public.transform_role_to_invite(tmp.role) AS role,
      true AS is_tmp
    FROM public.tmp_users tmp
    WHERE tmp.org_id = get_org_members.guild_id
    AND tmp.cancelled_at IS NULL
    AND GREATEST(tmp.updated_at, tmp.created_at) > (CURRENT_TIMESTAMP - INTERVAL '7 days');
END;
$$;

ALTER FUNCTION "public"."get_org_members" ("user_id" uuid, "guild_id" uuid) OWNER TO "postgres";
ALTER FUNCTION "public"."get_org_members" ("guild_id" "uuid") OWNER TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_org_members" ("guild_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_org_members" ("guild_id" "uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_org_members" ("user_id" uuid, "guild_id" uuid) TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_org_members" ("guild_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_org_members" ("user_id" uuid, "guild_id" uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION "public"."check_org_members_password_policy"("org_id" "uuid")
    RETURNS TABLE (
        "user_id" "uuid",
        "email" text,
        "first_name" text,
        "last_name" text,
        "password_policy_compliant" boolean
    )
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_user_id uuid;
    v_is_service_role boolean;
BEGIN
  v_user_id := public.get_identity('{read,upload,write,all}'::public.key_mode[]);
  v_is_service_role := (
    ((SELECT auth.jwt() ->> 'role') = 'service_role')
    OR ((SELECT session_user) IS NOT DISTINCT FROM 'postgres')
  );

    IF NOT v_is_service_role THEN
      IF v_user_id IS NULL OR NOT (
        public.check_min_rights(
          'super_admin'::public.user_min_right,
          (SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], check_org_members_password_policy.org_id)),
          check_org_members_password_policy.org_id,
          NULL::character varying,
          NULL::bigint
        )
      ) THEN
        PERFORM public.pg_log('deny: NO_RIGHTS', jsonb_build_object('org_id', check_org_members_password_policy.org_id, 'uid', v_user_id));
        RAISE EXCEPTION 'NO_RIGHTS';
      END IF;
    END IF;

    -- Check if org exists
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE public.orgs.id = check_org_members_password_policy.org_id) THEN
        RAISE EXCEPTION 'Organization does not exist';
    END IF;

    RETURN QUERY
    SELECT
        ou.user_id,
        au.email::text,
        u.first_name::text,
        u.last_name::text,
        public.user_meets_password_policy(ou.user_id, check_org_members_password_policy.org_id) AS "password_policy_compliant"
    FROM public.org_users ou
    JOIN auth.users au ON au.id = ou.user_id
    LEFT JOIN public.users u ON u.id = ou.user_id
    WHERE ou.org_id = check_org_members_password_policy.org_id;
END;
$$;

ALTER FUNCTION "public"."check_org_members_password_policy"("org_id" "uuid") OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."check_org_members_password_policy"("org_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."check_org_members_password_policy"("org_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."check_org_members_password_policy"("org_id" "uuid") FROM PUBLIC;
