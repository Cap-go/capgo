-- Create a reusable function for email hashing
CREATE OR REPLACE FUNCTION "public"."hash_email"(email TEXT)
RETURNS TEXT
LANGUAGE "sql"
SECURITY DEFINER
AS $$
    SELECT encode(digest(email, 'sha256'), 'hex');
$$;

ALTER FUNCTION "public"."hash_email"(TEXT) OWNER TO "postgres";

-- Fix the trigger_http_queue_post_to_function to handle DELETE operations
CREATE OR REPLACE FUNCTION "public"."trigger_http_queue_post_to_function"()
RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY DEFINER
AS $$
DECLARE 
  payload jsonb;
BEGIN 
  -- Build the base payload
  payload := jsonb_build_object(
    'function_name', TG_ARGV[0],
    'function_type', TG_ARGV[1],
    'payload', jsonb_build_object(
      'old_record', OLD, 
      'record', NEW, 
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA
    )
  );
  
  -- Also send to function-specific queue
  IF TG_ARGV[0] IS NOT NULL THEN
    PERFORM pgmq.send(TG_ARGV[0], payload);
  END IF;
  
  -- Return OLD for DELETE operations, NEW for others
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

ALTER FUNCTION "public"."trigger_http_queue_post_to_function"() OWNER TO "postgres";

-- Update the delete_user function to use the hash_email function
CREATE OR REPLACE FUNCTION "public"."delete_user"() 
RETURNS "void"
LANGUAGE "plpgsql" 
SECURITY DEFINER
AS $$
DECLARE
  user_id uuid;
  user_email text;
  hashed_email text;
BEGIN
  -- Get the current user ID and email
  SELECT auth.uid() INTO user_id;
  SELECT email INTO user_email FROM auth.users WHERE id = user_id;
  
  -- Hash the email using the new hash_email function
  SELECT hash_email(user_email) INTO hashed_email;
  
  INSERT INTO public.deleted_account (email)
  VALUES (hashed_email);
  
  -- Trigger the queue-based deletion process
  PERFORM pgmq.send(
    'on_user_delete',
    json_build_object(
      'user_id', user_id,
      'email', user_email
    )
  );
  
  -- Delete the user from auth.users
  -- This will cascade to other tables due to foreign key constraints
  DELETE FROM auth.users WHERE id = user_id;
END;
$$;

ALTER FUNCTION "public"."delete_user"() OWNER TO "postgres";
