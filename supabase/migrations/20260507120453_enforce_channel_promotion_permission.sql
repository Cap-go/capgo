CREATE OR REPLACE FUNCTION public.enforce_channel_version_promotion_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_role text := COALESCE(auth.role(), session_user);
BEGIN
  IF NEW.version IS NOT DISTINCT FROM OLD.version THEN
    RETURN NEW;
  END IF;

  IF v_request_role IN ('service_role', 'postgres') THEN
    RETURN NEW;
  END IF;

  IF v_request_role IS DISTINCT FROM 'anon' AND v_request_role IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED_CHANNEL_PROMOTE_BUNDLE'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.rbac_check_permission_request(
    public.rbac_perm_channel_promote_bundle(),
    OLD.owner_org,
    OLD.app_id,
    OLD.id
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED_CHANNEL_PROMOTE_BUNDLE'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_channel_version_promotion_permission() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_channel_version_promotion_permission() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_channel_version_promotion_permission ON public.channels;
CREATE TRIGGER enforce_channel_version_promotion_permission
BEFORE UPDATE OF version ON public.channels
FOR EACH ROW
EXECUTE FUNCTION public.enforce_channel_version_promotion_permission();


CREATE OR REPLACE FUNCTION "public"."get_accessible_apps_for_apikey_v2"(
  "apikey" "text" DEFAULT NULL
) RETURNS SETOF "public"."apps"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_apikey text;
  v_api_key public.apikeys%ROWTYPE;
BEGIN
  SELECT public.get_apikey_header() INTO v_request_apikey;

  IF v_request_apikey IS NULL OR v_request_apikey = '' THEN
    RETURN;
  END IF;

  IF apikey IS NOT NULL AND apikey <> '' AND apikey IS DISTINCT FROM v_request_apikey THEN
    RETURN;
  END IF;

  SELECT * INTO v_api_key
  FROM public.find_apikey_by_value(v_request_apikey)
  LIMIT 1;

  IF v_api_key.id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT a.*
  FROM public.apps a
  WHERE public.rbac_check_permission_direct(
    public.rbac_perm_app_read(),
    v_api_key.user_id,
    a.owner_org,
    a.app_id,
    NULL,
    v_request_apikey
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

GRANT EXECUTE ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"(
  "apikey" "text"
) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"(
  "apikey" "text"
) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"(
  "apikey" "text"
) TO "service_role";

COMMENT ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"(
  "apikey" "text"
) IS 'Returns apps visible to the request capgkey using RBAC-aware permission checks with legacy fallback. The apikey argument is retained for CLI compatibility and must match the header when provided.';
