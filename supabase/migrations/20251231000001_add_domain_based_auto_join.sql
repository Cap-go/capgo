-- ============================================================================
-- Migration: Domain-Based Auto-Join Feature
-- Description: Enables automatic organization enrollment based on email domains
-- ============================================================================
-- This feature allows organizations to configure trusted email domains
-- (e.g., @company.com) that automatically add new users to the organization
-- when they sign up or log in, eliminating the need for manual invitations.
-- ============================================================================

-- Add columns to orgs table if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orgs' AND column_name = 'allowed_email_domains') THEN
    ALTER TABLE public.orgs ADD COLUMN allowed_email_domains text[] DEFAULT '{}';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orgs' AND column_name = 'sso_enabled') THEN
    ALTER TABLE public.orgs ADD COLUMN sso_enabled boolean DEFAULT false;
  END IF;
END $$;

COMMENT ON COLUMN public.orgs.allowed_email_domains IS 'Email domains allowed for auto-join (e.g., ["company.com", "subsidiary.com"])';
COMMENT ON COLUMN public.orgs.sso_enabled IS 'Whether domain-based auto-join is enabled for this organization';

-- ============================================================================
-- FUNCTION: Domain-Based Auto-Join
-- ============================================================================
-- Automatically enrolls users to organizations based on email domain matching
-- This is the NON-SSO version that uses orgs.allowed_email_domains
-- ============================================================================

-- Drop existing function if return type changed
DROP FUNCTION IF EXISTS public.auto_join_user_to_orgs_by_email(uuid, text);

CREATE OR REPLACE FUNCTION public.auto_join_user_to_orgs_by_email(
  p_user_id uuid,
  p_email text
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
  -- Extract domain from email
  v_domain := lower(split_part(p_email, '@', 2));
  
  IF v_domain IS NULL OR v_domain = '' THEN
    RETURN;
  END IF;
  
  -- Find organizations with matching domain and auto-join enabled
  FOR v_org IN 
    SELECT DISTINCT o.id, o.name
    FROM public.orgs o
    WHERE o.sso_enabled = true 
      AND v_domain = ANY(o.allowed_email_domains)
      AND NOT EXISTS (
        SELECT 1 FROM public.org_users ou 
        WHERE ou.user_id = p_user_id AND ou.org_id = o.id
      )
  LOOP
    -- Add user to org with read permission
    INSERT INTO public.org_users (user_id, org_id, user_right, created_at)
    VALUES (p_user_id, v_org.id, 'read', now())
    ON CONFLICT (user_id, org_id) DO NOTHING;
    
    RAISE NOTICE 'Auto-joined user % to org % via domain %', p_user_id, v_org.name, v_domain;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.auto_join_user_to_orgs_by_email IS 'Auto-enrolls users to organizations based on email domain matching (non-SSO)';

-- ============================================================================
-- TRIGGER: Auto-Join on User Creation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_auto_join_on_user_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  -- Extract email from NEW user
  v_email := NEW.email;
  
  IF v_email IS NULL OR v_email = '' THEN
    RETURN NEW;
  END IF;
  
  -- Perform auto-join based on email domain
  BEGIN
    PERFORM public.auto_join_user_to_orgs_by_email(NEW.id, v_email);
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't block user creation
    RAISE WARNING 'Auto-join failed for user %: %', NEW.id, SQLERRM;
  END;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS auto_join_user_to_orgs_on_create ON auth.users;

-- Create trigger on user creation
CREATE TRIGGER auto_join_user_to_orgs_on_create
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_auto_join_on_user_create();

COMMENT ON FUNCTION public.trigger_auto_join_on_user_create IS 'Triggers domain-based auto-join when new users sign up';

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.auto_join_user_to_orgs_by_email TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_auto_join_on_user_create TO authenticated;
