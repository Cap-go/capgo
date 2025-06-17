CREATE OR REPLACE FUNCTION "public"."exist_app_versions" (
  "appid" character varying,
  "name_version" character varying
) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = 'public' AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.app_versions
  WHERE app_id=appid
  AND name=name_version));
End;  
$$;

GRANT ALL ON FUNCTION "public"."exist_app_versions" (
  "appid" character varying,
  "name_version" character varying
) TO "anon";

GRANT ALL ON FUNCTION "public"."exist_app_versions" (
  "appid" character varying,
  "name_version" character varying
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."exist_app_versions" (
  "appid" character varying,
  "name_version" character varying
) TO "service_role";

GRANT ALL ON FUNCTION "public"."exist_app_versions" (
  "appid" character varying,
  "name_version" character varying
) TO "anon";
