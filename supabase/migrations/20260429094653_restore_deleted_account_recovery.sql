CREATE OR REPLACE FUNCTION "public"."restore_deleted_account"() RETURNS "void"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  auth_uid uuid;
  auth_email text;
  last_sign_in_at_ts timestamptz;
  hashed_email text;
  restored_account_id uuid;
BEGIN
  SELECT "auth"."uid"() INTO auth_uid;
  IF auth_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT "email", "last_sign_in_at"
  INTO auth_email, last_sign_in_at_ts
  FROM "auth"."users"
  WHERE "id" = auth_uid;

  IF last_sign_in_at_ts IS NULL OR last_sign_in_at_ts < NOW() - INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'reauth_required' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM "public"."to_delete_accounts"
  WHERE "account_id" = auth_uid
    AND "removal_date" > NOW()
    AND "removal_date" <= NOW() + INTERVAL '30 days'
  RETURNING "account_id" INTO restored_account_id;

  IF restored_account_id IS NULL THEN
    RAISE EXCEPTION 'restore_window_expired' USING ERRCODE = 'P0001';
  END IF;

  IF auth_email IS NOT NULL AND auth_email <> '' THEN
    hashed_email := "encode"("extensions"."digest"(auth_email::text, 'sha256'::text), 'hex'::text);

    DELETE FROM "public"."deleted_account"
    WHERE "email" = hashed_email;
  END IF;
END;
$$;

ALTER FUNCTION "public"."restore_deleted_account"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."restore_deleted_account"() IS 'Restore the authenticated user account while still inside the delayed deletion window. Requires a recent sign-in.';

REVOKE ALL ON FUNCTION "public"."restore_deleted_account"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."restore_deleted_account"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."restore_deleted_account"() FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."restore_deleted_account"() TO "authenticated";
