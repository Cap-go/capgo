-- Create a dedicated queue for user deletion
SELECT pgmq.create('on_user_delete');

-- Update the delete_user function to use the queue-based approach
CREATE OR REPLACE FUNCTION "public"."delete_user"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_id uuid;
  user_email text;
  hashed_email text;
BEGIN
  -- Get the current user ID and email
  SELECT auth.uid() INTO user_id;
  SELECT email INTO user_email FROM auth.users WHERE id = user_id;
  
  -- Hash the email and store it in deleted_account table
  SELECT encode(digest(user_email, 'sha256'), 'hex') INTO hashed_email;
  
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

-- Create a trigger for user deletion
CREATE OR REPLACE TRIGGER "on_user_delete" 
AFTER DELETE ON "public"."users" 
FOR EACH ROW 
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_user_delete');
