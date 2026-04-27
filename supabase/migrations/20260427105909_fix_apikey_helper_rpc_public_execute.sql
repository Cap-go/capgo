-- Fix GHSA-7r6g-whg3-5mm4 by revoking helper RPC execution from PUBLIC.
--
-- Previous migrations only revoked these SECURITY DEFINER functions from the
-- anon role directly. PostgreSQL grants EXECUTE on new functions to PUBLIC by
-- default, and anon/authenticated both inherit PUBLIC, so the direct anon
-- revokes did not actually remove access.
--
-- Storage RLS still needs API-key identity resolution for anon requests, so we
-- add a non-exposed helper in a private schema for app-bucket checks instead
-- of keeping the parameterized get_user_id(text) RPC callable by anon.

REVOKE ALL ON FUNCTION public.get_user_id("apikey" text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_id("apikey" text) FROM ANON;
REVOKE ALL ON FUNCTION public.get_user_id(
    "apikey" text
) FROM AUTHENTICATED;
REVOKE ALL ON FUNCTION public.get_user_id(
    "apikey" text
) FROM SERVICE_ROLE;
GRANT EXECUTE ON FUNCTION public.get_user_id(
    "apikey" text
) TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.get_user_id(
    "apikey" text
) TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.get_user_id(
    "apikey" text, "app_id" text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_id(
    "apikey" text, "app_id" text
) FROM ANON;
REVOKE ALL ON FUNCTION public.get_user_id(
    "apikey" text, "app_id" text
) FROM AUTHENTICATED;
REVOKE ALL ON FUNCTION public.get_user_id(
    "apikey" text, "app_id" text
) FROM SERVICE_ROLE;
GRANT EXECUTE ON FUNCTION public.get_user_id(
    "apikey" text, "app_id" text
) TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.get_user_id(
    "apikey" text, "app_id" text
) TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.get_org_perm_for_apikey(
    "apikey" text, "app_id" text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_org_perm_for_apikey(
    "apikey" text, "app_id" text
) FROM ANON;
REVOKE ALL ON FUNCTION public.get_org_perm_for_apikey(
    "apikey" text, "app_id" text
) FROM AUTHENTICATED;
REVOKE ALL ON FUNCTION public.get_org_perm_for_apikey(
    "apikey" text, "app_id" text
) FROM SERVICE_ROLE;
GRANT EXECUTE ON FUNCTION public.get_org_perm_for_apikey(
    "apikey" text, "app_id" text
) TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.get_org_perm_for_apikey(
    "apikey" text, "app_id" text
) TO SERVICE_ROLE;

CREATE SCHEMA IF NOT EXISTS capgo_private; -- noqa: CP02
REVOKE ALL ON SCHEMA capgo_private FROM PUBLIC; -- noqa: CP02
GRANT USAGE ON SCHEMA capgo_private TO ANON; -- noqa: CP02
GRANT USAGE ON SCHEMA capgo_private TO AUTHENTICATED; -- noqa: CP02
GRANT USAGE ON SCHEMA capgo_private TO SERVICE_ROLE; -- noqa: CP02

CREATE OR REPLACE FUNCTION capgo_private.matches_app_storage_apikey_owner(
    folder_user_id text,
    target_app_id character varying,
    keymode public.key_mode []
) RETURNS boolean
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    api_key_text text;
    api_key record;
    target_app record;
BEGIN
    SELECT public.get_apikey_header() INTO api_key_text;

    IF api_key_text IS NULL THEN
        RETURN false;
    END IF;

    SELECT * FROM public.find_apikey_by_value(api_key_text) INTO api_key;

    IF api_key.id IS NULL OR NOT (api_key.mode = ANY(keymode)) THEN
        RETURN false;
    END IF;

    IF public.is_apikey_expired(api_key.expires_at) THEN
        RETURN false;
    END IF;

    SELECT user_id, owner_org
    INTO target_app
    FROM public.apps
    WHERE app_id = target_app_id
    LIMIT 1;

    IF target_app.user_id IS NULL THEN
        RETURN false;
    END IF;

    IF api_key.user_id::text <> folder_user_id THEN
        RETURN false;
    END IF;

    IF target_app.user_id <> api_key.user_id THEN
        RETURN false;
    END IF;

    IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0
        AND NOT (target_app.owner_org = ANY(api_key.limited_to_orgs)) THEN
        RETURN false;
    END IF;

    IF api_key.limited_to_apps IS DISTINCT FROM '{}'
        AND NOT (target_app_id = ANY(api_key.limited_to_apps)) THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$;

ALTER FUNCTION capgo_private.matches_app_storage_apikey_owner(
    text,
    character varying,
    public.key_mode []
) OWNER TO postgres;

COMMENT ON FUNCTION capgo_private.matches_app_storage_apikey_owner(
    text,
    character varying,
    public.key_mode []
) IS
'Internal non-RPC helper for storage app-bucket API-key auth.';

REVOKE ALL ON FUNCTION capgo_private.matches_app_storage_apikey_owner(
    text,
    character varying,
    public.key_mode []
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private.matches_app_storage_apikey_owner(
    text,
    character varying,
    public.key_mode []
) TO ANON, AUTHENTICATED, SERVICE_ROLE;

DROP POLICY IF EXISTS
"Allow user or apikey to delete they own folder in apps" -- noqa: RF05
ON STORAGE.OBJECTS;
CREATE POLICY
"Allow user or apikey to delete they own folder in apps" -- noqa: RF05
ON STORAGE.OBJECTS
FOR DELETE
USING (
    (
        (BUCKET_ID = 'apps'::text)
        AND (
            (
                ((SELECT auth.uid() AS AUTH_USER_ID))::text
                = (storage.foldername(NAME))[1]
            )
            OR capgo_private.matches_app_storage_apikey_owner(
                (storage.foldername(NAME))[1],
                (storage.foldername(NAME))[2]::character varying,
                '{all}'::public.key_mode []
            )
        )
    )
);

DROP POLICY IF EXISTS
"Allow user or apikey to update they own folder in apps" -- noqa: RF05
ON STORAGE.OBJECTS;
CREATE POLICY
"Allow user or apikey to update they own folder in apps" -- noqa: RF05
ON STORAGE.OBJECTS
FOR UPDATE
USING (
    (
        (BUCKET_ID = 'apps'::text)
        AND (
            (
                ((SELECT auth.uid() AS AUTH_USER_ID))::text
                = (storage.foldername(NAME))[1]
            )
            OR capgo_private.matches_app_storage_apikey_owner(
                (storage.foldername(NAME))[1],
                (storage.foldername(NAME))[2]::character varying,
                '{write,all}'::public.key_mode []
            )
        )
    )
);

DROP POLICY IF EXISTS
"Allow user or apikey to insert they own folder in apps" -- noqa: RF05
ON STORAGE.OBJECTS;
CREATE POLICY
"Allow user or apikey to insert they own folder in apps" -- noqa: RF05
ON STORAGE.OBJECTS
FOR INSERT
WITH CHECK (
    (
        (BUCKET_ID = 'apps'::text)
        AND (
            (
                ((SELECT auth.uid() AS AUTH_USER_ID))::text
                = (storage.foldername(NAME))[1]
            )
            OR capgo_private.matches_app_storage_apikey_owner(
                (storage.foldername(NAME))[1],
                (storage.foldername(NAME))[2]::character varying,
                '{write,all}'::public.key_mode []
            )
        )
    )
);

DROP POLICY IF EXISTS
"Allow user or apikey to read they own folder in apps" -- noqa: RF05
ON STORAGE.OBJECTS;
CREATE POLICY
"Allow user or apikey to read they own folder in apps" -- noqa: RF05
ON STORAGE.OBJECTS
FOR SELECT
USING (
    (
        (BUCKET_ID = 'apps'::text)
        AND (
            (
                ((SELECT auth.uid() AS AUTH_USER_ID))::text
                = (storage.foldername(NAME))[1]
            )
            OR capgo_private.matches_app_storage_apikey_owner(
                (storage.foldername(NAME))[1],
                (storage.foldername(NAME))[2]::character varying,
                '{read,all}'::public.key_mode []
            )
        )
    )
);
