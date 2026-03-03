-- Fix check_domain_sso function to use SECURITY DEFINER
-- This allows anonymous users at login to check for SSO providers
-- without being blocked by RLS policies on sso_providers table

CREATE OR REPLACE FUNCTION "public"."check_domain_sso"("p_domain" text)
RETURNS TABLE("has_sso" boolean, "provider_id" text, "org_id" uuid)
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" TO ''
AS $$
  SELECT
    true AS has_sso,
    sp.provider_id,
    sp.org_id
  FROM "public"."sso_providers" sp
  WHERE sp.domain = p_domain
    AND sp.status = 'active'
  LIMIT 1;
$$;
