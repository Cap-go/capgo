-- Allow SSO metadata to satisfy domain enforcement
--
-- This function enhancement lets trusted SSO metadata (provider IDs tied to a
-- verified SAML domain) bypass the "SSO is required" check. That makes local
-- mocks and automated flows that already know the provider ID behave exactly
-- like a real SSO login while keeping the original enforcement for email-based
-- signups.

CREATE OR REPLACE FUNCTION public.enforce_sso_for_domains()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_domain text;
  v_sso_required boolean;
  v_provider_count integer;
  v_metadata_provider_id uuid;
  v_metadata_allows boolean := false;
BEGIN
  IF TG_OP != 'INSERT' THEN
    RETURN NEW;
  END IF;

  v_email := COALESCE(
    NEW.raw_user_meta_data->>'email',
    NEW.email
  );

  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;

  v_domain := lower(split_part(v_email, '@', 2));

  -- Try to read the SSO provider ID that a trusted SSO flow would set on the
  -- user row. If present and it matches the verified domain entry, allow the
  -- insert to proceed before blocking emails.
  BEGIN
    v_metadata_provider_id := NULLIF(NEW.raw_user_meta_data->>'sso_provider_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_metadata_provider_id := NULL;
  END;

  IF v_metadata_provider_id IS NULL THEN
    BEGIN
      v_metadata_provider_id := NULLIF(NEW.raw_app_meta_data->>'sso_provider_id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_metadata_provider_id := NULL;
    END;
  END IF;

  IF v_metadata_provider_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.saml_domain_mappings sdm
      JOIN public.org_saml_connections osc ON osc.id = sdm.sso_connection_id
      WHERE sdm.domain = v_domain
        AND sdm.verified = true
        AND osc.enabled = true
        AND osc.sso_provider_id = v_metadata_provider_id
    ) INTO v_metadata_allows;

    IF v_metadata_allows THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Check if this is an SSO signup (will have provider info in auth.identities)
  SELECT COUNT(*) INTO v_provider_count
  FROM auth.identities
  WHERE user_id = NEW.id
    AND provider != 'email';

  -- If signing up via SSO provider, allow it
  IF v_provider_count > 0 THEN
    RETURN NEW;
  END IF;

  -- Check if domain requires SSO
  v_sso_required := public.check_sso_required_for_domain(v_email);

  IF v_sso_required THEN
    RAISE EXCEPTION 'SSO authentication required for this email domain. Please use "Sign in with SSO" instead.'
      USING ERRCODE = 'CAPCR',
            HINT = 'Your organization requires SSO authentication';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_sso_for_domains IS 'Trigger function to enforce SSO for configured email domains';
