-- Function to hash an email using SHA-256
CREATE OR REPLACE FUNCTION "public"."hash_email"("email" text) RETURNS text
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
  hashed_email text;
BEGIN
  -- Hash the email using SHA-256
  SELECT encode(digest(email, 'sha256'), 'hex') INTO hashed_email;
  RETURN hashed_email;
END;
$$;

-- Grant permissions for the function
GRANT ALL ON FUNCTION "public"."hash_email"(text) TO "anon";
GRANT ALL ON FUNCTION "public"."hash_email"(text) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hash_email"(text) TO "service_role";
