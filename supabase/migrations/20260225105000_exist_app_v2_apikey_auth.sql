CREATE OR REPLACE FUNCTION "public"."exist_app_v2" ("appid" character varying) RETURNS boolean
LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  api_key text;
BEGIN
  IF session_user IN ('postgres', 'service_role') THEN
    RETURN (SELECT EXISTS (SELECT 1
      FROM public.apps
      WHERE app_id = appid));
  END IF;

  SELECT public.get_apikey_header() INTO api_key;

  IF api_key IS NULL OR api_key = '' THEN
    RETURN false;
  END IF;

  IF NOT public.is_allowed_capgkey(api_key, '{read,upload,write,all}'::"public"."key_mode"[], appid) THEN
    RETURN false;
  END IF;

  RETURN (SELECT EXISTS (SELECT 1
    FROM public.apps
    WHERE app_id = appid));
END;
$$;

REVOKE ALL ON FUNCTION "public"."exist_app_v2" ("appid" character varying) FROM "public";
GRANT ALL ON FUNCTION "public"."exist_app_v2" ("appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."exist_app_v2" ("appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."exist_app_v2" ("appid" character varying) TO "service_role";
