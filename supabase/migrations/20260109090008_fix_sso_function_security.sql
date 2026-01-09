-- ============================================================================
-- Migration: Fix SSO Function Security
-- ============================================================================
-- This migration addresses security concerns in the SSO functions:
-- 1. Removes authenticated grants from auto-enrollment functions (should only be callable by triggers)
-- 2. Adds permission checks to check_org_sso_configured
-- 3. Creates internal variant of get_sso_provider_id_for_user for trigger use
-- 4. Updates triggers to use internal function variant
-- ============================================================================

-- Step 1: Revoke authenticated access from auto-enrollment functions
-- These should only be called by triggers, not directly by users
REVOKE
EXECUTE ON FUNCTION public.auto_enroll_sso_user
FROM authenticated;

REVOKE
EXECUTE ON FUNCTION public.auto_join_user_to_orgs_by_email
FROM authenticated;

REVOKE
EXECUTE ON FUNCTION public.trigger_auto_join_on_user_create
FROM authenticated;

REVOKE
EXECUTE ON FUNCTION public.trigger_auto_join_on_user_update
FROM authenticated;

-- Step 2: Add permission check to check_org_sso_configured
-- Only allow checking SSO status for orgs where user is a member or for SSO detection flow
CREATE OR REPLACE FUNCTION public.check_org_sso_configured(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_member boolean;
  v_user_id uuid;
BEGIN
  -- Get current user ID (will be NULL for anon)
  v_user_id := auth.uid();
  
  -- If called from trigger/anon context, allow
  IF v_user_id IS NULL THEN
    -- Allow for anon users and trigger contexts during SSO detection flow
    RETURN EXISTS (
      SELECT 1
      FROM public.org_saml_connections
      WHERE org_id = p_org_id
        AND enabled = true
    );
  END IF;
  
  -- Check if user is a member of this org
  SELECT EXISTS (
    SELECT 1 FROM public.org_users
    WHERE org_id = p_org_id AND user_id = v_user_id
  ) INTO v_is_member;
  
  -- Only allow if user is a member
  IF NOT v_is_member THEN
    RAISE EXCEPTION 'Permission denied: not a member of this organization';
  END IF;
  
  RETURN EXISTS (
    SELECT 1
    FROM public.org_saml_connections
    WHERE org_id = p_org_id
      AND enabled = true
  );
END;
$$;

COMMENT ON FUNCTION public.check_org_sso_configured IS 'Checks if an organization has SSO enabled (with permission check)';

-- Step 3: Create internal variant for trigger use
-- This version uses auth.uid() to safely get the user's own metadata
CREATE OR REPLACE FUNCTION public.get_sso_provider_id_for_user_internal()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider_id uuid;
  v_user_id uuid;
BEGIN
  -- Get current user from auth context
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Check app_metadata first
  SELECT (raw_app_meta_data->>'sso_provider_id')::uuid
  INTO v_provider_id
  FROM auth.users
  WHERE id = v_user_id;
  
  -- Fallback to user_metadata if not in app_metadata
  IF v_provider_id IS NULL THEN
    SELECT (raw_user_meta_data->>'sso_provider_id')::uuid
    INTO v_provider_id
    FROM auth.users
    WHERE id = v_user_id;
  END IF;
  
  RETURN v_provider_id;
END;
$$;

COMMENT ON FUNCTION public.get_sso_provider_id_for_user_internal IS 'Internal: Retrieves SSO provider ID for current user from auth.uid()';

-- Grant to trigger execution contexts only
GRANT
EXECUTE ON FUNCTION public.get_sso_provider_id_for_user_internal TO postgres,
supabase_auth_admin;

-- Step 4: Update triggers to extract provider ID from NEW record
CREATE OR REPLACE FUNCTION public.trigger_auto_join_on_user_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_sso_provider_id uuid;
BEGIN
  v_email := COALESCE(NEW.raw_user_meta_data->>'email', NEW.email);
  
  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Extract provider ID directly from NEW record (app_metadata first, then user_metadata)
  v_sso_provider_id := (NEW.raw_app_meta_data->>'sso_provider_id')::uuid;
  
  IF v_sso_provider_id IS NULL THEN
    v_sso_provider_id := (NEW.raw_user_meta_data->>'sso_provider_id')::uuid;
  END IF;
  
  -- If no SSO provider in metadata, try domain lookup
  IF v_sso_provider_id IS NULL THEN
    v_sso_provider_id := public.lookup_sso_provider_for_email(v_email);
  END IF;
  
  -- Perform auto-join with the provider ID (if found)
  PERFORM public.auto_join_user_to_orgs_by_email(NEW.id, v_email, v_sso_provider_id);
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_auto_join_on_user_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_sso_provider_id uuid;
BEGIN
  v_email := COALESCE(NEW.raw_user_meta_data->>'email', NEW.email);
  
  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Extract provider ID directly from NEW record (app_metadata first, then user_metadata)
  v_sso_provider_id := (NEW.raw_app_meta_data->>'sso_provider_id')::uuid;
  
  IF v_sso_provider_id IS NULL THEN
    v_sso_provider_id := (NEW.raw_user_meta_data->>'sso_provider_id')::uuid;
  END IF;
  
  -- If no SSO provider, try looking it up by domain
  IF v_sso_provider_id IS NULL THEN
    v_sso_provider_id := public.lookup_sso_provider_for_email(v_email);
  END IF;
  
  -- Perform auto-join with the provider ID (if found)
  PERFORM public.auto_join_user_to_orgs_by_email(NEW.id, v_email, v_sso_provider_id);
  
  RETURN NEW;
END;
$$;