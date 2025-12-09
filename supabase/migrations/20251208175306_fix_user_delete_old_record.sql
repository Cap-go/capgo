-- Update delete_user function to fetch old_record using row_to_json query format
CREATE OR REPLACE FUNCTION "public"."delete_user" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  user_id_fn uuid;
  user_email text;
  old_record_json jsonb;
BEGIN
  -- Get the current user ID and email
  SELECT "auth"."uid"() INTO user_id_fn;
  SELECT "email" INTO user_email FROM "auth"."users" WHERE "id" = user_id_fn;
  
  -- Fetch the old_record using the specified query format
  SELECT row_to_json(u)::jsonb INTO old_record_json
  FROM (
    SELECT *
    FROM public.users
    WHERE id = user_id_fn
  ) AS u;
  
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
  
  -- Mark the user for deletion
  INSERT INTO "public"."to_delete_accounts" (
    "account_id", 
    "removal_date", 
    "removed_data"
  ) VALUES 
  (
    user_id_fn, 
    NOW() + INTERVAL '30 days', 
    "jsonb_build_object"('email', user_email, 'apikeys', (SELECT "jsonb_agg"("to_jsonb"(a.*)) FROM "public"."apikeys" a WHERE a."user_id" = user_id_fn))
  );

  -- Delete the API keys
  DELETE FROM "public"."apikeys" WHERE "public"."apikeys"."user_id" = user_id_fn;
END;
$$;
