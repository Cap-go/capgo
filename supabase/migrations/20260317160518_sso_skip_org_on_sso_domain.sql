-- Fix: prevent auto-org creation for users whose email domain has an active SSO provider.
-- When a new SSO user logs in, auth.ts lazily creates a public.users row which fires
-- generate_org_on_user_create. For SSO domains, provision-user.ts assigns the correct org,
-- so this auto-created personal org is unwanted. Skip it when an active SSO provider exists
-- for the user's domain.
--
-- Only skips org creation when:
--   1. The user authenticated via SSO (provider != 'email') — prevents email/password signups
--      with a corporate domain from being left in a broken no-org state.
--   2. The domain has an active SSO provider AND the owning org has sso_enabled = true —
--      consistent with check_domain_sso and all other SSO lookups in the system.
--   3. btrim applied to the domain component — matches the normalization contract from
--      migration 20260312183000 which enforces lower(btrim(domain)).

CREATE OR REPLACE FUNCTION "public"."generate_org_on_user_create" () RETURNS "trigger" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  org_record record;
  has_sso boolean;
  user_provider text;
BEGIN
    SELECT raw_app_meta_data->>'provider'
    INTO user_provider
    FROM auth.users
    WHERE id = NEW.id;

    -- Compute has_sso first so it can be combined with the provider check below.
    -- Mirror the sso_enabled guard from check_domain_sso to stay consistent.
    SELECT EXISTS (
      SELECT 1 FROM public.sso_providers sp
      JOIN public.orgs o ON o.id = sp.org_id AND o.sso_enabled = true
      WHERE sp.domain = lower(btrim(split_part(NEW.email, '@', 2)))
      AND sp.status = 'active'
    ) INTO has_sso;

    -- Skip org creation only for genuine SAML SSO logins on SSO-managed domains.
    -- Supabase sets app_metadata.provider to 'sso:<provider_uuid>' for SAML sessions.
    -- Email, phone, and OAuth providers (e.g. google, github) always get a personal org,
    -- even when their email domain matches an active SSO provider.
    -- NULL-safe: if user_provider is NULL (e.g. raw_app_meta_data not yet set),
    -- treat it as a non-SSO login so the personal org is created as normal.
    IF NOT (user_provider IS NOT NULL AND user_provider ~ '^sso:' AND has_sso) THEN
      INSERT INTO public.orgs (created_by, name, management_email) values (NEW.id, format('%s organization', NEW.first_name), NEW.email) RETURNING * INTO org_record;
    END IF;

    RETURN NEW;
END $$;
