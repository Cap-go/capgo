-- Fix: prevent auto-org creation for users whose email domain has an active SSO provider.
-- When a new SSO user logs in, auth.ts lazily creates a public.users row which fires
-- generate_org_on_user_create. For SSO domains, provision-user.ts assigns the correct org,
-- so this auto-created personal org is unwanted. Skip it when an active SSO provider exists
-- for the user's domain.

CREATE OR REPLACE FUNCTION "public"."generate_org_on_user_create" () RETURNS "trigger" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  org_record record;
  has_sso boolean;
BEGIN
    -- Skip auto-org for SSO-managed domains; provision-user.ts assigns the correct org
    SELECT EXISTS (
      SELECT 1 FROM public.sso_providers
      WHERE domain = lower(split_part(NEW.email, '@', 2))
      AND status = 'active'
    ) INTO has_sso;

    IF has_sso THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.orgs (created_by, name, management_email) values (NEW.id, format('%s organization', NEW.first_name), NEW.email) RETURNING * INTO org_record;

    RETURN NEW;
END $$;
