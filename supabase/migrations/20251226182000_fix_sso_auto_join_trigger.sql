-- Fix SSO auto-enrollment trigger
-- The previous trigger looked for sso_provider_id in raw_app_meta_data, but Supabase
-- stores SSO provider info in auth.identities with provider format 'sso:<provider-uuid>'
-- This migration fixes the trigger to properly extract the SSO provider ID

-- ============================================================================
-- FUNCTION: Extract SSO provider ID from auth.identities
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_sso_provider_id_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider text;
  v_provider_id uuid;
BEGIN
  -- Look for SSO identity in auth.identities
  -- SSO providers have format: 'sso:<uuid>'
  SELECT provider INTO v_provider
  FROM auth.identities
  WHERE user_id = p_user_id
    AND provider LIKE 'sso:%'
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_provider IS NOT NULL AND v_provider LIKE 'sso:%' THEN
    -- Extract UUID from 'sso:<uuid>' format
    v_provider_id := substring(v_provider from 5)::uuid;
    RETURN v_provider_id;
  END IF;
  
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.get_sso_provider_id_for_user IS 'Extract SSO provider UUID from auth.identities for a user';

-- ============================================================================
-- UPDATE: Trigger function for user creation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_auto_join_on_user_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sso_provider_id uuid;
  v_email text;
BEGIN
  v_email := NEW.email;
  
  -- Get SSO provider ID from identities table
  -- This is called AFTER INSERT, so identities should exist
  v_sso_provider_id := public.get_sso_provider_id_for_user(NEW.id);
  
  -- Perform auto-enrollment (SSO or domain-based)
  IF v_email IS NOT NULL THEN
    PERFORM public.auto_join_user_to_orgs_by_email(NEW.id, v_email, v_sso_provider_id);
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trigger_auto_join_on_user_create IS 'Auto-enrolls new users to organizations based on SSO provider or email domain';

-- ============================================================================
-- UPDATE: Trigger function for user update (SSO login for existing users)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_auto_join_on_user_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sso_provider_id uuid;
  v_email text;
  v_already_enrolled boolean;
BEGIN
  v_email := NEW.email;
  
  -- Get SSO provider ID from identities table
  v_sso_provider_id := public.get_sso_provider_id_for_user(NEW.id);
  
  -- Only perform auto-enrollment if user has an SSO provider
  IF v_email IS NOT NULL AND v_sso_provider_id IS NOT NULL THEN
    -- Check if user is already enrolled in any org with this SSO provider
    SELECT EXISTS (
      SELECT 1 
      FROM public.org_users ou
      JOIN public.org_saml_connections osc ON osc.org_id = ou.org_id
      WHERE ou.user_id = NEW.id
        AND osc.sso_provider_id = v_sso_provider_id
    ) INTO v_already_enrolled;
    
    -- Only auto-enroll if not already in an org with this SSO provider
    IF NOT v_already_enrolled THEN
      PERFORM public.auto_join_user_to_orgs_by_email(NEW.id, v_email, v_sso_provider_id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trigger_auto_join_on_user_update IS 'Auto-enrolls existing users when they log in with SSO';

-- ============================================================================
-- RECREATE TRIGGERS
-- ============================================================================

-- Drop and recreate the create trigger
DROP TRIGGER IF EXISTS auto_join_user_to_orgs_on_create ON auth.users;

CREATE TRIGGER auto_join_user_to_orgs_on_create
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_auto_join_on_user_create();

-- Drop and recreate the update trigger
DROP TRIGGER IF EXISTS auto_join_user_to_orgs_on_update ON auth.users;

CREATE TRIGGER auto_join_user_to_orgs_on_update
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_auto_join_on_user_update();

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_sso_provider_id_for_user TO postgres, supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.trigger_auto_join_on_user_create TO postgres, supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.trigger_auto_join_on_user_update TO postgres, supabase_auth_admin;

