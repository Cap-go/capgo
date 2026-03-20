-- ============================================================================
-- Restrict API key oracle RPC access and patch related RLS/function behavior
-- ============================================================================
REVOKE ALL ON FUNCTION "public"."get_user_id" ("apikey" "text") FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_user_id" ("apikey" "text", "app_id" "text") FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_org_perm_for_apikey" ("apikey" "text", "app_id" "text") FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_user_id" ("apikey" "text") FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."get_user_id" ("apikey" "text", "app_id" "text") FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."get_org_perm_for_apikey" ("apikey" "text", "app_id" "text") FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."get_user_id" ("apikey" "text") FROM "public";
REVOKE ALL ON FUNCTION "public"."get_user_id" ("apikey" "text", "app_id" "text") FROM "public";
REVOKE ALL ON FUNCTION "public"."get_org_perm_for_apikey" ("apikey" "text", "app_id" "text") FROM "public";

GRANT EXECUTE ON FUNCTION "public"."get_user_id" ("apikey" "text") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_user_id" ("apikey" "text", "app_id" "text") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_org_perm_for_apikey" ("apikey" "text", "app_id" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_identity_apikey_only" ("keymode" "public"."key_mode" []) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_identity_apikey_only" ("keymode" "public"."key_mode" []) FROM anon;
REVOKE ALL ON FUNCTION "public"."get_identity_apikey_only" ("keymode" "public"."key_mode" []) FROM authenticated;
GRANT EXECUTE ON FUNCTION "public"."get_identity_apikey_only" ("keymode" "public"."key_mode" []) TO "service_role";

-- Keep a dedicated boolean wrapper for storage RLS so the direct identity
-- helper can remain service-role only while bucket policies still authorize
-- authenticated users and API-key uploads.
CREATE OR REPLACE FUNCTION "public"."can_access_apps_bucket_object"(
    "keymode" "public"."key_mode" [],
    "object_name" "text"
) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
AS $$
DECLARE
    _auth_uid uuid;
    _api_key_text text;
    _api_key_user_id uuid;
    _folder_parts text[];
BEGIN
    _folder_parts := "storage"."foldername"(object_name);

    SELECT auth.uid() INTO _auth_uid;
    IF _auth_uid IS NOT NULL THEN
        RETURN _auth_uid::text = _folder_parts[1];
    END IF;

    SELECT public.get_apikey_header() INTO _api_key_text;
    IF _api_key_text IS NULL THEN
        RETURN false;
    END IF;

    IF NOT public.is_allowed_capgkey(_api_key_text, keymode, _folder_parts[1]) THEN
        RETURN false;
    END IF;

    SELECT public.get_identity_apikey_only(keymode) INTO _api_key_user_id;
    RETURN _api_key_user_id IS NOT NULL AND _api_key_user_id::text = _folder_parts[1];
END;
$$;

ALTER FUNCTION "public"."can_access_apps_bucket_object"("keymode" "public"."key_mode"[], "object_name" "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."can_access_apps_bucket_object"("keymode" "public"."key_mode"[], "object_name" "text") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."can_access_apps_bucket_object"("keymode" "public"."key_mode"[], "object_name" "text") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."can_access_apps_bucket_object"("keymode" "public"."key_mode"[], "object_name" "text") TO "authenticated";

-- Fix is_allowed_action to validate api keys instead of returning organization access
-- for any provided app id, which allowed invalid-key oracle responses.
CREATE OR REPLACE FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
AS $$
DECLARE
    _apikey_user_id uuid;
    _org_id uuid;
BEGIN
    SELECT public.get_user_id(is_allowed_action.apikey) INTO _apikey_user_id;
    IF _apikey_user_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT owner_org
    INTO _org_id
    FROM public.apps
    WHERE app_id = is_allowed_action.appid
    LIMIT 1;
    IF _org_id IS NULL THEN
        RETURN false;
    END IF;

    IF NOT public.is_app_owner(_apikey_user_id, is_allowed_action.appid) THEN
        RETURN false;
    END IF;

    RETURN public.is_allowed_action_org(_org_id);
END;
$$;

REVOKE ALL ON FUNCTION "public"."is_allowed_action" ("apikey" "text", "appid" "text") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_allowed_action" ("apikey" "text", "appid" "text") FROM anon;
REVOKE ALL ON FUNCTION "public"."is_allowed_action" ("apikey" "text", "appid" "text") FROM authenticated;
GRANT EXECUTE ON FUNCTION "public"."is_allowed_action" ("apikey" "text", "appid" "text") TO "service_role";

-- Remove legacy apps bucket policies that still call get_user_id in policy expressions,
-- because function ACL is now service-role-only.
DROP POLICY IF EXISTS "Allow user or apikey to delete they own folder in apps" ON "storage"."objects";
CREATE POLICY "Allow user or apikey to delete they own folder in apps" ON "storage"."objects"
FOR DELETE
    TO anon, authenticated
    USING (
        ("bucket_id" = 'apps'::"text")
        AND public.can_access_apps_bucket_object(
            '{all}'::"public"."key_mode" [],
            "name"
        )
    );

DROP POLICY IF EXISTS "Allow user or apikey to update they own folder in apps" ON "storage"."objects";
CREATE POLICY "Allow user or apikey to update they own folder in apps" ON "storage"."objects"
FOR UPDATE
    TO anon, authenticated
    USING (
        ("bucket_id" = 'apps'::"text")
        AND public.can_access_apps_bucket_object(
            '{write,all}'::"public"."key_mode" [],
            "name"
        )
    );

DROP POLICY IF EXISTS "Allow user or apikey to insert they own folder in apps" ON "storage"."objects";
CREATE POLICY "Allow user or apikey to insert they own folder in apps" ON "storage"."objects"
FOR INSERT
    TO anon, authenticated
    WITH
    CHECK (
        ("bucket_id" = 'apps'::"text")
        AND public.can_access_apps_bucket_object(
            '{write,all}'::"public"."key_mode" [],
            "name"
        )
    );

DROP POLICY IF EXISTS "Allow user or apikey to read they own folder in apps" ON "storage"."objects";
CREATE POLICY "Allow user or apikey to read they own folder in apps" ON "storage"."objects"
FOR SELECT
    TO anon, authenticated
    USING (
        ("bucket_id" = 'apps'::"text")
        AND public.can_access_apps_bucket_object(
            '{read,all}'::"public"."key_mode" [],
            "name"
        )
    );
