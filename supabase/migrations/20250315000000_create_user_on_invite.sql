-- Add a trigger to the existing invite_user_to_org function to return CREATE_USER instead of NO_EMAIL
-- This approach avoids replacing the existing function while adding the new behavior
CREATE OR REPLACE FUNCTION "public"."invite_user_to_org_wrapper"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  result character varying;
BEGIN
  -- Call the original function
  SELECT invite_user_to_org(email, org_id, invite_type) INTO result;
  
  -- If the result is NO_EMAIL, return CREATE_USER instead
  IF result = 'NO_EMAIL' THEN
    RETURN 'CREATE_USER';
  ELSE
    RETURN result;
  END IF;
END;
$$;

-- Create a new function to add a user to an organization after they've been created
CREATE OR REPLACE FUNCTION "public"."add_user_to_org_after_creation"("user_id" "uuid", "org_id" "uuid", "invite_type" "public"."user_min_right") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Declare  
  current_record record;
Begin
  SELECT org_users.id from org_users 
  INTO current_record
  WHERE org_users.user_id=add_user_to_org_after_creation.user_id
  AND org_users.org_id=add_user_to_org_after_creation.org_id;

  IF current_record IS NOT NULL THEN
    RETURN 'ALREADY_INVITED';
  ELSE
    INSERT INTO org_users (user_id, org_id, user_right)
    VALUES (add_user_to_org_after_creation.user_id, add_user_to_org_after_creation.org_id, invite_type);

    RETURN 'OK';
  END IF;
End;
$$;
