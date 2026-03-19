-- Stop creating personal organizations as soon as a public.users row is inserted.
-- Organization creation now happens explicitly through the onboarding flow.
CREATE OR REPLACE FUNCTION "public"."generate_org_on_user_create" ()
RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN NEW;
END;
$$;
