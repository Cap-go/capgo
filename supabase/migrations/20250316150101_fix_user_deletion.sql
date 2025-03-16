-- Fix the on_user_delete trigger to properly hash emails before inserting into deleted_account table
DROP TRIGGER IF EXISTS "on_user_delete" ON "public"."users";

-- Create a function to handle user deletion and email hashing
CREATE OR REPLACE FUNCTION "public"."handle_user_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Hash the email before sending to the queue
  PERFORM pgmq.send(
    'on_user_delete',
    json_build_object(
      'user_id', OLD.id,
      'email', OLD.email,
      'hashed_email', encode(digest(OLD.email, 'sha256'), 'hex')
    )
  );
  
  -- Insert the hashed email into deleted_account table
  INSERT INTO public.deleted_account (email)
  VALUES (encode(digest(OLD.email, 'sha256'), 'hex'));
  
  RETURN OLD;
END;
$$;

-- Create the trigger
CREATE TRIGGER "on_user_delete" 
AFTER DELETE ON "public"."users" 
FOR EACH ROW 
EXECUTE FUNCTION "public"."handle_user_delete"();
