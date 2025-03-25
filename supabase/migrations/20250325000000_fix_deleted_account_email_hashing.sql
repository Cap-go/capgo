-- Update the on_user_delete trigger function to hash emails properly
CREATE OR REPLACE FUNCTION "public"."on_user_delete_trigger_function"() 
RETURNS TRIGGER AS $$
BEGIN
  -- Hash the email before insertion into deleted_account
  INSERT INTO public.deleted_account (email)
  VALUES (encode(digest(OLD.email, 'sha256'), 'hex'));
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Make sure the trigger uses the updated function
DROP TRIGGER IF EXISTS "on_user_delete_email_hash" ON "public"."users";

CREATE TRIGGER "on_user_delete_email_hash"
BEFORE DELETE ON "public"."users"
FOR EACH ROW
EXECUTE FUNCTION "public"."on_user_delete_trigger_function"();
