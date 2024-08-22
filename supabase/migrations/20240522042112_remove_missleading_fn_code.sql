CREATE OR REPLACE FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT id
  FROM app_versions
  WHERE app_id=appid
  AND name=name_version
  AND owner_org=(select get_user_main_org_id_by_app_id(appid))
  AND (
    public.is_member_of_org(get_user_id(apikey), (SELECT get_user_main_org_id_by_app_id(appid)))
    OR
    public.is_owner_of_org(get_user_id(apikey), (SELECT get_user_main_org_id_by_app_id(appid)))
  ));
End;  
$$;

DROP FUNCTION IF EXISTS "public"."get_user_id"("apikey" "text", "app_id" "text");

CREATE OR REPLACE FUNCTION "public"."get_org_owner_id"("apikey" "text", "app_id" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Declare  
 org_owner_id uuid;
 real_user_id uuid;
 org_id uuid;
Begin
  SELECT apps.user_id FROM apps WHERE apps.app_id=get_org_owner_id.app_id into org_owner_id;
  SELECT get_user_main_org_id_by_app_id(app_id) INTO org_id;

  -- (public.is_member_of_org((select auth.uid()), org_id) OR public.is_owner_of_org((select auth.uid()), org_id))
  SELECT user_id
  INTO real_user_id
  FROM apikeys
  WHERE key=apikey;

  IF (public.is_member_of_org(real_user_id, org_id) IS FALSE AND public.is_owner_of_org(real_user_id, org_id) IS FALSE)
  THEN
    raise exception 'NO_RIGHTS';
  END IF;

  RETURN org_owner_id;
End;  
$$;

ALTER FUNCTION "public"."get_org_owner_id"("apikey" "text", "app_id" "text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."get_org_owner_id"("apikey" "text", "app_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_owner_id"("apikey" "text", "app_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_owner_id"("apikey" "text", "app_id" "text") TO "service_role";
