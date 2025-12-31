-- Add auto_join_enabled column to org_saml_connections
-- This controls whether SSO-authenticated users are automatically added to the organization
ALTER TABLE public.org_saml_connections 
  ADD COLUMN IF NOT EXISTS auto_join_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.org_saml_connections.auto_join_enabled IS 'Whether SSO-authenticated users are automatically enrolled in the organization';
