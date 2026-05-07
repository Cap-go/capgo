CREATE OR REPLACE FUNCTION "public"."exist_app_versions"(
  "appid" character varying,
  "name_version" character varying
) RETURNS boolean
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
BEGIN
  RETURN public.exist_app_versions(
    exist_app_versions.appid,
    exist_app_versions.name_version,
    public.get_apikey_header()
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."exist_app_versions"(
  "appid" character varying,
  "name_version" character varying,
  "apikey" "text"
) RETURNS boolean
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_org_id uuid;
  v_request_role text;
  v_user_id uuid;
  v_api_key text;
BEGIN
  SELECT owner_org
  INTO v_org_id
  FROM public.apps
  WHERE app_id = exist_app_versions.appid
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT public.current_request_role()
  INTO v_request_role;

  IF public.is_internal_request_role(v_request_role) THEN
    RETURN (
      SELECT EXISTS (
        SELECT 1
        FROM public.app_versions
        WHERE app_id = exist_app_versions.appid
          AND name = exist_app_versions.name_version
          AND owner_org = v_org_id
      )
    );
  END IF;

  SELECT auth.uid()
  INTO v_user_id;

  v_api_key := exist_app_versions.apikey;

  IF v_api_key = '' THEN
    v_api_key := NULL;
  END IF;

  IF v_api_key IS NULL THEN
    SELECT public.get_apikey_header()
    INTO v_api_key;
  END IF;

  IF v_user_id IS NULL AND v_api_key IS NULL THEN
    RETURN false;
  END IF;

  IF public.rbac_check_permission_direct(
    public.rbac_perm_app_read_bundles(),
    v_user_id,
    v_org_id,
    exist_app_versions.appid,
    NULL::bigint,
    v_api_key
  ) IS NOT TRUE THEN
    RETURN false;
  END IF;

  RETURN (
    SELECT EXISTS (
      SELECT 1
      FROM public.app_versions
      WHERE app_id = exist_app_versions.appid
        AND name = exist_app_versions.name_version
        AND owner_org = v_org_id
    )
  );
END;
$$;

ALTER FUNCTION "public"."exist_app_versions"(
  "appid" character varying,
  "name_version" character varying
) OWNER TO "postgres";

ALTER FUNCTION "public"."exist_app_versions"(
  "appid" character varying,
  "name_version" character varying,
  "apikey" "text"
) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."exist_app_versions"(
  "appid" character varying,
  "name_version" character varying
) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."exist_app_versions"(
  "appid" character varying,
  "name_version" character varying,
  "apikey" "text"
) FROM PUBLIC;

-- API key requests reach PostgREST as anon, so keep EXECUTE while the function gates data with RBAC.
GRANT EXECUTE ON FUNCTION "public"."exist_app_versions"(
  "appid" character varying,
  "name_version" character varying
) TO "anon";

GRANT EXECUTE ON FUNCTION "public"."exist_app_versions"(
  "appid" character varying,
  "name_version" character varying
) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."exist_app_versions"(
  "appid" character varying,
  "name_version" character varying
) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."exist_app_versions"(
  "appid" character varying,
  "name_version" character varying,
  "apikey" "text"
) TO "anon";

GRANT EXECUTE ON FUNCTION "public"."exist_app_versions"(
  "appid" character varying,
  "name_version" character varying,
  "apikey" "text"
) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."exist_app_versions"(
  "appid" character varying,
  "name_version" character varying,
  "apikey" "text"
) TO "service_role";
