-- Restore user account during 30-day grace period
-- Allows users to cancel their account deletion request

CREATE OR REPLACE FUNCTION "public"."restore_user" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  user_id_fn uuid;
  account_record RECORD;
  apikeys_json jsonb;
  apikey_record RECORD;
BEGIN
  -- Get the current user ID
  SELECT "auth"."uid"() INTO user_id_fn;
  IF user_id_fn IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  -- Check if user is in the deletion queue
  SELECT * INTO account_record
  FROM "public"."to_delete_accounts"
  WHERE "account_id" = user_id_fn;

  IF NOT FOUND THEN
    -- User not in deletion queue, nothing to restore
    RETURN;
  END IF;

  -- Restore API keys if any exist
  apikeys_json := account_record.removed_data->'apikeys';
  IF apikeys_json IS NOT NULL AND jsonb_array_length(apikeys_json) > 0 THEN
    FOR apikey_record IN SELECT * FROM jsonb_array_elements(apikeys_json)
    LOOP
      -- Check if this API key already exists (by key value)
      IF NOT EXISTS (
        SELECT 1 FROM "public"."apikeys" WHERE "key" = apikey_record->>'key'
      ) THEN
        INSERT INTO "public"."apikeys" (
          "user_id",
          "key",
          "mode",
          "name",
          "limited_to_orgs",
          "limited_to_apps",
          "expires_at"
        ) VALUES (
          user_id_fn,
          apikey_record->>'key',
          (apikey_record->>'mode')::"public"."apikeys"."mode"%TYPE,
          apikey_record->>'name',
          COALESCE((apikey_record->'limited_to_orgs')::text[], ARRAY[]::text[]),
          COALESCE((apikey_record->'limited_to_apps')::text[], ARRAY[]::text[]),
          (apikey_record->>'expires_at')::timestamptz
        );
      END IF;
    END LOOP;
  END IF;

  -- Remove from deletion queue
  DELETE FROM "public"."to_delete_accounts" WHERE "account_id" = user_id_fn;
  
  RAISE NOTICE 'User account restored successfully';
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."restore_user"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."restore_user"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."restore_user"() TO "service_role";
