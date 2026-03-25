CREATE OR REPLACE FUNCTION "public"."cli_check_permission"(
  "apikey" "text",
  "permission_key" "text",
  "org_id" "uuid" DEFAULT NULL,
  "app_id" "text" DEFAULT NULL,
  "channel_id" bigint DEFAULT NULL
) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF apikey IS NULL OR apikey = '' OR permission_key IS NULL OR permission_key = '' THEN
    RETURN false;
  END IF;

  SELECT public.get_user_id(apikey) INTO v_user_id;

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.rbac_check_permission_direct(
    permission_key,
    v_user_id,
    org_id,
    app_id,
    channel_id,
    apikey
  );
END;
$$;

ALTER FUNCTION "public"."cli_check_permission"(
  "apikey" "text",
  "permission_key" "text",
  "org_id" "uuid",
  "app_id" "text",
  "channel_id" bigint
) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."cli_check_permission"(
  "apikey" "text",
  "permission_key" "text",
  "org_id" "uuid",
  "app_id" "text",
  "channel_id" bigint
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."cli_check_permission"(
  "apikey" "text",
  "permission_key" "text",
  "org_id" "uuid",
  "app_id" "text",
  "channel_id" bigint
) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."cli_check_permission"(
  "apikey" "text",
  "permission_key" "text",
  "org_id" "uuid",
  "app_id" "text",
  "channel_id" bigint
) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."cli_check_permission"(
  "apikey" "text",
  "permission_key" "text",
  "org_id" "uuid",
  "app_id" "text",
  "channel_id" bigint
) TO "service_role";

COMMENT ON FUNCTION "public"."cli_check_permission"(
  "apikey" "text",
  "permission_key" "text",
  "org_id" "uuid",
  "app_id" "text",
  "channel_id" bigint
) IS 'CLI permission wrapper. Resolves the user from the API key and delegates to rbac_check_permission_direct, preserving RBAC/legacy fallback semantics.';

CREATE OR REPLACE FUNCTION "public"."get_accessible_apps_for_apikey_v2"(
  "apikey" "text"
) RETURNS SETOF "public"."apps"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT public.get_user_id(apikey) INTO v_user_id;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT a.*
  FROM public.apps a
  WHERE public.rbac_check_permission_direct(
    public.rbac_perm_app_read(),
    v_user_id,
    a.owner_org,
    a.app_id,
    NULL,
    apikey
  )
  ORDER BY a.created_at DESC;
END;
$$;

ALTER FUNCTION "public"."get_accessible_apps_for_apikey_v2"(
  "apikey" "text"
) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"(
  "apikey" "text"
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"(
  "apikey" "text"
) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"(
  "apikey" "text"
) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"(
  "apikey" "text"
) TO "service_role";

COMMENT ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"(
  "apikey" "text"
) IS 'Returns apps visible to an API key using RBAC-aware permission checks with legacy fallback.';
