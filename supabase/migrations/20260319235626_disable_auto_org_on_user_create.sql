-- Stop creating personal organizations as soon as a public.users row is inserted.
-- Organization creation now happens explicitly through the onboarding flow.
DROP TRIGGER IF EXISTS "generate_org_on_user_create" ON "public"."users";
DROP FUNCTION IF EXISTS "public"."generate_org_on_user_create"();
