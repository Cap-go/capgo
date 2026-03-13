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

-- Fix is_allowed_action to validate api keys instead of returning organization access
-- for any provided app id, which allowed invalid-key oracle responses.
CREATE OR REPLACE FUNCTION "public"."is_allowed_action" ("apikey" "text", "appid" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" = '' AS $$
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

-- Remove legacy apps bucket policies that still call get_user_id in policy expressions,
-- because function ACL is now service-role-only.
DROP POLICY IF EXISTS "Allow user or apikey to delete they own folder in apps" ON "storage"."objects";
CREATE POLICY "Allow user or apikey to delete they own folder in apps" ON "storage"."objects"
FOR DELETE
    TO anon, authenticated
    USING (
        ("bucket_id" = 'apps'::"text")
        AND (
            (
                (SELECT "auth"."uid" ())::text = ("storage"."foldername" ("name")) [0]
            )
            OR (
                public.get_identity_apikey_only(
                    '{all}'::"public"."key_mode" []
                )::text = ("storage"."foldername" ("name")) [0]
                AND public.is_allowed_capgkey(
                    (
                        SELECT
                            "public"."get_apikey_header" ()
                    ),
                    '{all}'::"public"."key_mode" [],
                    ("storage"."foldername" ("name")) [1]
                )
            )
        )
    );

DROP POLICY IF EXISTS "Allow user or apikey to update they own folder in apps" ON "storage"."objects";
CREATE POLICY "Allow user or apikey to update they own folder in apps" ON "storage"."objects"
FOR UPDATE
    TO anon, authenticated
    USING (
        ("bucket_id" = 'apps'::"text")
        AND (
            (
                (SELECT "auth"."uid" ())::text = ("storage"."foldername" ("name")) [0]
            )
            OR (
                public.get_identity_apikey_only(
                    '{write,all}'::"public"."key_mode" []
                )::text = ("storage"."foldername" ("name")) [0]
                AND public.is_allowed_capgkey(
                    (
                        SELECT
                            "public"."get_apikey_header" ()
                    ),
                    '{write,all}'::"public"."key_mode" [],
                    ("storage"."foldername" ("name")) [1]
                )
            )
        )
    );

DROP POLICY IF EXISTS "Allow user or apikey to insert they own folder in apps" ON "storage"."objects";
CREATE POLICY "Allow user or apikey to insert they own folder in apps" ON "storage"."objects"
FOR INSERT
    TO anon, authenticated
    WITH
    CHECK (
        ("bucket_id" = 'apps'::"text")
        AND (
            (
                (SELECT "auth"."uid" ())::text = ("storage"."foldername" ("name")) [0]
            )
            OR (
                public.get_identity_apikey_only(
                    '{write,all}'::"public"."key_mode" []
                )::text = ("storage"."foldername" ("name")) [0]
                AND public.is_allowed_capgkey(
                    (
                        SELECT
                            "public"."get_apikey_header" ()
                    ),
                    '{write,all}'::"public"."key_mode" [],
                    ("storage"."foldername" ("name")) [1]
                )
            )
        )
    );

DROP POLICY IF EXISTS "Allow user or apikey to read they own folder in apps" ON "storage"."objects";
CREATE POLICY "Allow user or apikey to read they own folder in apps" ON "storage"."objects"
FOR SELECT
    TO anon, authenticated
    USING (
        ("bucket_id" = 'apps'::"text")
        AND (
            (
                (SELECT "auth"."uid" ())::text = ("storage"."foldername" ("name")) [0]
            )
            OR (
                public.get_identity_apikey_only(
                    '{read,all}'::"public"."key_mode" []
                )::text = ("storage"."foldername" ("name")) [0]
                AND public.is_allowed_capgkey(
                    (
                        SELECT
                            "public"."get_apikey_header" ()
                    ),
                    '{read,all}'::"public"."key_mode" [],
                    ("storage"."foldername" ("name")) [1]
                )
            )
        )
    );
