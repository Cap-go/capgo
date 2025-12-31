-- Migration: Add SSO auto-enrollment trigger for user login/update
-- Description: Handles SSO auto-enrollment when existing users log in with SSO for the first time
-- Author: Capgo Team
-- Date: 2025-12-24

-- ============================================================================
-- TRIGGER: Auto-enroll SSO users on login/update
-- ============================================================================

-- Function to handle auto-enrollment when user metadata is updated (login with SSO)
CREATE OR REPLACE FUNCTION public.trigger_auto_join_on_user_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sso_provider_id uuid;
  v_old_sso_provider_id uuid;
  v_email text;
BEGIN
  v_email := NEW.email;
  
  -- Extract SSO provider ID from new user metadata
  v_sso_provider_id := (NEW.raw_app_meta_data->>'sso_provider_id')::uuid;
  
  -- If no sso_provider_id in app metadata, check user metadata
  IF v_sso_provider_id IS NULL THEN
    v_sso_provider_id := (NEW.raw_user_meta_data->>'sso_provider_id')::uuid;
  END IF;
  
  -- Extract old SSO provider ID to check if it's a new SSO login
  IF OLD.raw_app_meta_data IS NOT NULL THEN
    v_old_sso_provider_id := (OLD.raw_app_meta_data->>'sso_provider_id')::uuid;
  END IF;
  
  IF v_old_sso_provider_id IS NULL AND OLD.raw_user_meta_data IS NOT NULL THEN
    v_old_sso_provider_id := (OLD.raw_user_meta_data->>'sso_provider_id')::uuid;
  END IF;
  
  -- Only perform auto-enrollment if:
  -- 1. User has an SSO provider ID (SSO login)
  -- 2. This is the first time they're logging in with SSO (provider ID changed from NULL to a value)
  IF v_email IS NOT NULL 
     AND v_sso_provider_id IS NOT NULL 
     AND v_old_sso_provider_id IS NULL THEN
    PERFORM public.auto_join_user_to_orgs_by_email(NEW.id, v_email, v_sso_provider_id);
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trigger_auto_join_on_user_update IS 'Auto-enrolls existing users when they log in with SSO for the first time';

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS auto_join_user_to_orgs_on_update ON auth.users;

-- Create trigger on user update
CREATE TRIGGER auto_join_user_to_orgs_on_update
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (NEW.raw_app_meta_data IS DISTINCT FROM OLD.raw_app_meta_data 
        OR NEW.raw_user_meta_data IS DISTINCT FROM OLD.raw_user_meta_data)
  EXECUTE FUNCTION public.trigger_auto_join_on_user_update();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.trigger_auto_join_on_user_update TO postgres;
GRANT EXECUTE ON FUNCTION public.trigger_auto_join_on_user_update TO supabase_auth_admin;

-- ============================================================================
-- COMMENTS AND DOCUMENTATION
-- ============================================================================

COMMENT ON FUNCTION public.trigger_auto_join_on_user_update IS 
'Triggers SSO auto-enrollment when existing users log in with SSO for the first time. 
Only fires when metadata changes to avoid unnecessary calls.';
