-- Create a function to hash email consistently
CREATE OR REPLACE FUNCTION "public"."hash_email"(email TEXT)
RETURNS TEXT
LANGUAGE "sql" SECURITY DEFINER
AS $$
  SELECT encode(digest(email, 'sha256'), 'hex')
$$;
