-- Prevent unverified accounts from starting the account deletion lifecycle.

CREATE OR REPLACE FUNCTION "public"."delete_user" () RETURNS "void" LANGUAGE "plpgsql" SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  user_id_fn uuid;
  user_email text;
  old_record_json jsonb;
  last_sign_in_at_ts timestamptz;
  email_confirmed_at_ts timestamptz;
  did_schedule integer;
BEGIN
  -- Get the current user ID and email details
  SELECT "auth"."uid"() INTO user_id_fn;
  IF user_id_fn IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT "email", "last_sign_in_at", "email_confirmed_at"
  INTO user_email, last_sign_in_at_ts, email_confirmed_at_ts
  FROM "auth"."users"
  WHERE "id" = user_id_fn;

  -- Require a verified email address before allowing account deletion
  IF email_confirmed_at_ts IS NULL THEN
    RAISE EXCEPTION 'email_not_verified' USING ERRCODE = 'P0003';
  END IF;

  -- Require a fresh reauthentication (password confirmation)
  IF last_sign_in_at_ts IS NULL OR last_sign_in_at_ts < NOW() - INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'reauth_required' USING ERRCODE = 'P0001';
  END IF;

  -- Fetch the old_record using the specified query format
  SELECT row_to_json(u)::jsonb INTO old_record_json
  FROM (
    SELECT *
    FROM "public"."users"
    WHERE id = user_id_fn
  ) AS u;

  IF old_record_json IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Mark the user for deletion
  INSERT INTO "public"."to_delete_accounts" (
    "account_id",
    "removal_date",
    "removed_data"
  ) VALUES
  (
    user_id_fn,
    NOW() + INTERVAL '30 days',
    "jsonb_build_object"('email', user_email, 'apikeys', COALESCE((SELECT "jsonb_agg"("to_jsonb"(a.*)) FROM "public"."apikeys" a WHERE a."user_id" = user_id_fn), '[]'::jsonb))
  )
  ON CONFLICT ("account_id") DO NOTHING
  RETURNING 1 INTO did_schedule;

  -- Retry-safe: only enqueue cleanup actions when this is a new delete request.
  IF did_schedule IS NULL THEN
    RETURN;
  END IF;

  -- Trigger the queue-based deletion process
  -- This cancels the subscriptions of the user's organizations
  PERFORM "pgmq"."send"(
    'on_user_delete'::text,
    "jsonb_build_object"(
      'payload', "jsonb_build_object"(
        'old_record', old_record_json,
        'table', 'users',
        'type', 'DELETE'
      ),
      'function_name', 'on_user_delete'
    )
  );

  -- Delete the API keys
  DELETE FROM "public"."apikeys" WHERE "public"."apikeys"."user_id" = user_id_fn;
END;
$$;

ALTER FUNCTION "public"."delete_user"() OWNER TO "postgres";
