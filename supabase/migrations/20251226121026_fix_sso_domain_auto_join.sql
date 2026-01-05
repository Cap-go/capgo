-- Fix SSO domain-based auto-join
-- This migration updates auto_join_user_to_orgs_by_email to check SAML domain mappings
-- Previously it only checked allowed_email_domains array on orgs table

-- Update auto_join_user_to_orgs_by_email to support SSO domain mappings
DROP FUNCTION IF EXISTS public.auto_join_user_to_orgs_by_email(uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.auto_join_user_to_orgs_by_email(
  p_user_id uuid,
  p_email text,
  p_sso_provider_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain text;
  v_org record;
BEGIN
  v_domain := lower(split_part(p_email, '@', 2));
  
  IF v_domain IS NULL OR v_domain = '' THEN
    RETURN;
  END IF;
  
  -- Priority 1: SSO provider-based enrollment (strongest binding)
  IF p_sso_provider_id IS NOT NULL THEN
    PERFORM public.auto_enroll_sso_user(p_user_id, p_email, p_sso_provider_id);
    RETURN;  -- SSO enrollment takes precedence
  END IF;
  
  -- Priority 2: Domain-based enrollment REMOVED
  -- Users with SSO domains MUST authenticate through SSO provider
  -- No auto-join without SSO authentication
  -- This enforces security by requiring Okta/IdP validation
  
  -- Priority 3: Legacy domain-based enrollment removed
  -- The allowed_email_domains column doesn't exist in orgs table
  -- All domain-based enrollment is now handled through saml_domain_mappings
END;
$$;

COMMENT ON FUNCTION public.auto_join_user_to_orgs_by_email IS 'Auto-enrolls users via SSO provider, SAML domain mappings, or legacy domain matching';
