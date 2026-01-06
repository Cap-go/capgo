-- Enforce SSO authentication for configured domains
-- Prevents email/password signups when SSO is enabled for a domain

-- Function to check if domain requires SSO
CREATE OR REPLACE FUNCTION public.check_sso_required_for_domain(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain text;
  v_sso_required boolean;
BEGIN
  -- Extract domain from email
  v_domain := lower(split_part(p_email, '@', 2));
  
  IF COALESCE(v_domain, '') = '' THEN
    RETURN false;
  END IF;
  
  -- Check if domain has verified SSO configuration
  SELECT EXISTS (
    SELECT 1
    FROM public.saml_domain_mappings sdm
    JOIN public.org_saml_connections osc ON osc.id = sdm.sso_connection_id
    WHERE sdm.domain = v_domain
      AND sdm.verified = true
      AND osc.enabled = true
  ) INTO v_sso_required;
  
  RETURN v_sso_required;
END;
$$;

COMMENT ON FUNCTION public.check_sso_required_for_domain IS 'Check if email domain requires SSO authentication';

-- Trigger to block email/password signups for SSO domains
CREATE OR REPLACE FUNCTION public.enforce_sso_for_domains()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_sso_required boolean;
  v_provider_count integer;
BEGIN
  -- Only check on INSERT (signup)
  IF TG_OP != 'INSERT' THEN
    RETURN NEW;
  END IF;
  
  -- Extract email from raw_user_meta_data or email field
  v_email := COALESCE(
    NEW.raw_user_meta_data->>'email',
    NEW.email
  );
  
  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if this is an SSO signup (will have provider info)
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
      USING ERRCODE = 'CAPCR', -- Custom error code: CAPGO Custom Restriction
            HINT = 'Your organization requires SSO authentication';
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_sso_for_domains IS 'Trigger function to enforce SSO for configured email domains';

-- Create trigger on auth.users (runs before insert)
DROP TRIGGER IF EXISTS enforce_sso_domain_signup ON auth.users;

CREATE TRIGGER enforce_sso_domain_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_sso_for_domains();

-- Grant necessary permissions
GRANT
EXECUTE ON FUNCTION public.check_sso_required_for_domain TO postgres,
anon,
authenticated;

GRANT
EXECUTE ON FUNCTION public.enforce_sso_for_domains TO postgres,
supabase_auth_admin;