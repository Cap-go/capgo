-- Enforce Single SSO Configuration Per Organization
-- This migration ensures each organization can only have one SSO configuration

-- ============================================================================
-- STEP 1: Clean up duplicate SSO configurations
-- Keep only the most recent configuration per organization
-- ============================================================================

-- First, identify and log duplicates for audit purposes
DO $$
DECLARE
  duplicate_count integer;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT org_id, COUNT(*) as config_count
    FROM public.org_saml_connections
    GROUP BY org_id
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF duplicate_count > 0 THEN
    RAISE NOTICE 'Found % organizations with duplicate SSO configurations', duplicate_count;
  END IF;
END $$;

-- Delete duplicate configurations, keeping only the most recent one per org
WITH ranked_configs AS (
  SELECT 
    id,
    org_id,
    ROW_NUMBER() OVER (
      PARTITION BY org_id 
      ORDER BY updated_at DESC, created_at DESC
    ) as rn
  FROM public.org_saml_connections
)
DELETE FROM public.org_saml_connections
WHERE id IN (
  SELECT id 
  FROM ranked_configs 
  WHERE rn > 1
);

-- ============================================================================
-- STEP 2: Add unique constraint on org_id
-- ============================================================================

-- Drop the existing composite unique constraint since we're adding a stricter one
ALTER TABLE public.org_saml_connections 
DROP CONSTRAINT IF EXISTS org_saml_connections_org_provider_unique;

-- Add unique constraint on org_id to ensure only one SSO config per organization
ALTER TABLE public.org_saml_connections 
ADD CONSTRAINT org_saml_connections_org_unique UNIQUE(org_id);

-- ============================================================================
-- STEP 3: Add unique constraint on entity_id to prevent same IdP for multiple orgs
-- ============================================================================

-- Ensure entity_id is unique across all organizations
-- This prevents multiple organizations from using the same IdP configuration
ALTER TABLE public.org_saml_connections 
ADD CONSTRAINT org_saml_connections_entity_id_unique UNIQUE(entity_id);

-- ============================================================================
-- STEP 4: Update comments
-- ============================================================================

COMMENT ON CONSTRAINT org_saml_connections_org_unique ON public.org_saml_connections 
IS 'Ensures each organization can only have one SSO configuration';

COMMENT ON CONSTRAINT org_saml_connections_entity_id_unique ON public.org_saml_connections 
IS 'Ensures each IdP entity ID can only be used by one organization';

-- ============================================================================
-- STEP 5: Add validation trigger to provide clear error messages
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_single_sso_per_org()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- This function is mostly for documentation since the unique constraint handles enforcement
  -- But we can add custom error messages here if needed
  RETURN NEW;
END;
$$;

-- Note: Trigger not needed since unique constraints provide better error messages
-- and are enforced at the database level

-- ============================================================================
-- STEP 6: Create helper function to check if org already has SSO
-- ============================================================================

CREATE OR REPLACE FUNCTION public.org_has_sso_configured(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.org_saml_connections 
    WHERE org_id = p_org_id
  );
END;
$$;

COMMENT ON FUNCTION public.org_has_sso_configured(uuid) 
IS 'Check if an organization already has SSO configured';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.org_has_sso_configured(uuid) TO authenticated;
