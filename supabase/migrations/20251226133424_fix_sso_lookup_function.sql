-- Fix SSO lookup function to return correct field names for frontend compatibility
CREATE OR REPLACE FUNCTION public.lookup_sso_provider_by_domain(
  p_email text
)
RETURNS TABLE (
  provider_id uuid,
  entity_id text,
  org_id uuid,
  org_name text,
  provider_name text,
  metadata_url text,
  enabled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain text;
BEGIN
  -- Extract domain from email
  v_domain := lower(split_part(p_email, '@', 2));

  IF v_domain IS NULL OR v_domain = '' THEN
    RETURN;
  END IF;

  -- Return all matching SSO providers ordered by priority
  RETURN QUERY
  SELECT
    osc.sso_provider_id as provider_id,
    osc.entity_id,
    osc.org_id,
    o.name as org_name,
    osc.provider_name,
    osc.metadata_url,
    osc.enabled
  FROM public.saml_domain_mappings sdm
  JOIN public.org_saml_connections osc ON osc.id = sdm.sso_connection_id
  JOIN public.orgs o ON o.id = osc.org_id
  WHERE sdm.domain = v_domain
    AND sdm.verified = true
    AND osc.enabled = true
  ORDER BY sdm.priority DESC, osc.created_at DESC;
END;
$$;