-- ==========================================================================
-- Use auth context for account removal date lookups
-- ==========================================================================

DROP FUNCTION IF EXISTS "public"."get_account_removal_date"("user_id" "uuid");

CREATE OR REPLACE FUNCTION "public"."get_account_removal_date"() RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    removal_date TIMESTAMPTZ;
    auth_uid uuid;
BEGIN
    SELECT auth.uid() INTO auth_uid;
    IF auth_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT to_delete_accounts.removal_date INTO removal_date
    FROM public.to_delete_accounts
    WHERE account_id = auth_uid;

    IF removal_date IS NULL THEN
        RAISE EXCEPTION 'Account with ID % is not marked for deletion', auth_uid;
    END IF;

    RETURN removal_date;
END;
$$;

REVOKE EXECUTE ON FUNCTION "public"."get_account_removal_date"() FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."get_account_removal_date"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_account_removal_date"() TO "service_role";
