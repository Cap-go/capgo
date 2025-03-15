-- Fix the delete_user function to handle dependencies properly
CREATE OR REPLACE FUNCTION "public"."delete_user"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_id uuid;
  user_email text;
BEGIN
  -- Get current user ID and email
  user_id := (select auth.uid());
  user_email := (select auth.email());
  
  -- Add to deleted_account table to prevent email reuse
  INSERT INTO public.deleted_account (email, id)
  VALUES (user_email, user_id)
  ON CONFLICT (email) DO NOTHING;
  
  -- Delete the user from auth.users
  -- This will cascade to public.users due to the ON DELETE CASCADE constraint
  DELETE FROM auth.users WHERE id = user_id;
END;
$$;

ALTER FUNCTION "public"."delete_user"() OWNER TO "postgres";

-- Grant appropriate permissions
GRANT ALL ON FUNCTION "public"."delete_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user"() TO "service_role";

