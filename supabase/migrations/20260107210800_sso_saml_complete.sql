-- ============================================================================
-- CONSOLIDATED SSO SAML Migration
-- Replaces 12 incremental migrations (20251224022658 through 20260106000000)
-- ============================================================================
-- This migration consolidates all SSO/SAML functionality including:
-- - SAML SSO configuration tables
-- - Domain-to-provider mappings
-- - Auto-enrollment logic with auto_join_enabled flag
-- - Comprehensive audit logging
-- - SSO provider lookup functions with all fixes applied
-- - Auto-join triggers with all domain/metadata checks
-- - Single SSO per organization enforcement
-- - RLS policies for security
-- ============================================================================

-- ============================================================================
-- TABLE: org_saml_connections
-- Stores SAML SSO configuration per organization (ONE per org)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.org_saml_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,

-- Supabase SSO Provider Info (from CLI output)
sso_provider_id uuid NOT NULL UNIQUE,
provider_name text NOT NULL, -- "Okta", "Azure AD", "Google Workspace", etc.

-- SAML Configuration
metadata_url text, -- IdP metadata URL (preferred for auto-refresh)
metadata_xml text, -- Stored XML if URL not available
entity_id text NOT NULL, -- IdP's SAML EntityID

-- Certificate Management (for rotation detection)
current_certificate text,
certificate_expires_at timestamptz,
certificate_last_checked timestamptz DEFAULT now(),

-- Status Flags
enabled boolean NOT NULL DEFAULT false,
verified boolean NOT NULL DEFAULT false,
auto_join_enabled boolean NOT NULL DEFAULT false, -- Controls automatic enrollment

-- Optional Attribute Mapping
-- Maps SAML attributes to user properties
-- Example: {"email": {"name": "mail"}, "first_name": {"name": "givenName"}}
attribute_mapping jsonb DEFAULT '{}'::jsonb,

-- Audit Fields
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
created_by uuid REFERENCES auth.users (id),

-- Constraints
CONSTRAINT org_saml_connections_org_unique UNIQUE(org_id),
  CONSTRAINT org_saml_connections_entity_id_unique UNIQUE(entity_id),
  CONSTRAINT org_saml_connections_metadata_check CHECK (
    metadata_url IS NOT NULL OR metadata_xml IS NOT NULL
  )
);

COMMENT ON
TABLE public.org_saml_connections IS 'Tracks SAML SSO configurations per organization (one per org)';

COMMENT ON COLUMN public.org_saml_connections.sso_provider_id IS 'UUID returned by Supabase CLI when adding SSO provider';

COMMENT ON COLUMN public.org_saml_connections.metadata_url IS 'IdP metadata URL for automatic refresh';

COMMENT ON COLUMN public.org_saml_connections.verified IS 'Whether SSO connection has been successfully tested';

COMMENT ON COLUMN public.org_saml_connections.auto_join_enabled IS 'Whether SSO-authenticated users are automatically enrolled in the organization';

COMMENT ON CONSTRAINT org_saml_connections_org_unique ON public.org_saml_connections IS 'Ensures each organization can only have one SSO configuration';

COMMENT ON CONSTRAINT org_saml_connections_entity_id_unique ON public.org_saml_connections IS 'Ensures each IdP entity ID can only be used by one organization';

-- ============================================================================
-- TABLE: saml_domain_mappings
-- Maps email domains to SSO providers (supports multi-provider setups)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.saml_domain_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

-- Domain Configuration
domain text NOT NULL,
org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
sso_connection_id uuid NOT NULL REFERENCES public.org_saml_connections (id) ON DELETE CASCADE,

-- Priority for multiple providers (higher = shown first)
priority int NOT NULL DEFAULT 0,

-- Verification Status (future: DNS TXT validation if needed)
verified boolean NOT NULL DEFAULT true, -- Auto-verified via SSO by default
verification_code text,
verified_at timestamptz,

-- Audit
created_at timestamptz NOT NULL DEFAULT now(),

-- Constraints
CONSTRAINT saml_domain_mappings_domain_connection_unique UNIQUE(domain, sso_connection_id)
);

COMMENT ON
TABLE public.saml_domain_mappings IS 'Maps email domains to SSO providers for auto-join';

COMMENT ON COLUMN public.saml_domain_mappings.priority IS 'Display order when multiple providers exist (higher first)';

-- ============================================================================
-- TABLE: sso_audit_logs
-- Comprehensive audit trail for SSO authentication events
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sso_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),

-- User Identity
user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
email text,

-- Event Type
event_type text NOT NULL,
-- Possible values: 'login_success', 'login_failed', 'logout', 'session_expired',
--                  'config_created', 'config_updated', 'config_deleted',
--                  'provider_added', 'provider_removed', 'auto_join_success'

-- Context
org_id uuid REFERENCES public.orgs (id) ON DELETE SET NULL,
sso_provider_id uuid,
sso_connection_id uuid REFERENCES public.org_saml_connections (id) ON DELETE SET NULL,

-- Technical Details
ip_address inet, user_agent text, country text,

-- SAML-Specific Fields
saml_assertion_id text, -- SAML assertion ID for tracing
saml_session_index text, -- Session identifier from IdP

-- Error Details (for failed events)
error_code text, error_message text,

-- Additional Metadata
metadata jsonb DEFAULT '{}'::jsonb );

COMMENT ON
TABLE public.sso_audit_logs IS 'Audit trail for all SSO authentication and configuration events';

COMMENT ON COLUMN public.sso_audit_logs.event_type IS 'Type of SSO event (login, logout, config change, etc.)';

-- ============================================================================
-- INDEXES for Performance
-- ============================================================================

-- org_saml_connections indexes
CREATE INDEX IF NOT EXISTS idx_saml_connections_org_enabled ON public.org_saml_connections (org_id)
WHERE
    enabled = true;

CREATE INDEX IF NOT EXISTS idx_saml_connections_provider ON public.org_saml_connections (sso_provider_id);

CREATE INDEX IF NOT EXISTS idx_saml_connections_cert_expiry ON public.org_saml_connections (certificate_expires_at)
WHERE
    certificate_expires_at IS NOT NULL
    AND enabled = true;

-- saml_domain_mappings indexes
CREATE INDEX IF NOT EXISTS idx_saml_domains_domain_verified ON public.saml_domain_mappings (domain)
WHERE
    verified = true;

CREATE INDEX IF NOT EXISTS idx_saml_domains_connection ON public.saml_domain_mappings (sso_connection_id);

CREATE INDEX IF NOT EXISTS idx_saml_domains_org ON public.saml_domain_mappings (org_id);

-- sso_audit_logs indexes
CREATE INDEX IF NOT EXISTS idx_sso_audit_user_time ON public.sso_audit_logs (user_id, timestamp DESC)
WHERE
    user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sso_audit_org_time ON public.sso_audit_logs (org_id, timestamp DESC)
WHERE
    org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sso_audit_event_time ON public.sso_audit_logs (event_type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_sso_audit_provider ON public.sso_audit_logs (
    sso_provider_id,
    timestamp DESC
)
WHERE
    sso_provider_id IS NOT NULL;

-- Failed login monitoring
CREATE INDEX IF NOT EXISTS idx_sso_audit_failures ON public.sso_audit_logs (ip_address, timestamp DESC)
WHERE
    event_type = 'login_failed';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Helper function to check if domain requires SSO
CREATE OR REPLACE FUNCTION public.check_sso_required_for_domain(p_email text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain text;
  v_has_sso boolean;
BEGIN
  v_domain := lower(split_part(p_email, '@', 2));
  
  IF v_domain IS NULL OR v_domain = '' THEN
    RETURN false;
  END IF;
  
  SELECT EXISTS (
    SELECT 1
    FROM public.saml_domain_mappings sdm
    JOIN public.org_saml_connections osc ON osc.id = sdm.sso_connection_id
    WHERE sdm.domain = v_domain
      AND sdm.verified = true
      AND osc.enabled = true
  ) INTO v_has_sso;
  
  RETURN v_has_sso;
END;
$$;

COMMENT ON FUNCTION public.check_sso_required_for_domain IS 'Checks if an email domain has SSO configured and enabled';

-- Helper function to check if org has SSO configured
CREATE OR REPLACE FUNCTION public.check_org_sso_configured(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.org_saml_connections
    WHERE org_id = p_org_id
      AND enabled = true
  );
END;
$$;

COMMENT ON FUNCTION public.check_org_sso_configured IS 'Checks if an organization has SSO enabled';

-- Helper function to get SSO provider ID for a user
CREATE OR REPLACE FUNCTION public.get_sso_provider_id_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider_id uuid;
BEGIN
  SELECT (raw_app_meta_data->>'sso_provider_id')::uuid
  INTO v_provider_id
  FROM auth.users
  WHERE id = p_user_id;
  
  IF v_provider_id IS NULL THEN
    SELECT (raw_user_meta_data->>'sso_provider_id')::uuid
    INTO v_provider_id
    FROM auth.users
    WHERE id = p_user_id;
  END IF;
  
  RETURN v_provider_id;
END;
$$;

COMMENT ON FUNCTION public.get_sso_provider_id_for_user IS 'Retrieves SSO provider ID from user metadata';

-- Helper function to check if org already has SSO configured
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

COMMENT ON FUNCTION public.org_has_sso_configured (uuid) IS 'Check if an organization already has SSO configured';

-- ============================================================================
-- FUNCTIONS: SSO Provider Lookup (FINAL VERSION WITH ALL FIXES)
-- ============================================================================

-- Function to lookup SSO provider by email domain
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

COMMENT ON FUNCTION public.lookup_sso_provider_by_domain IS 'Finds SSO providers configured for an email domain';

-- Alternative lookup function that returns the sso_provider_id directly
CREATE OR REPLACE FUNCTION public.lookup_sso_provider_for_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain text;
  v_provider_id uuid;
BEGIN
  v_domain := lower(split_part(p_email, '@', 2));
  
  IF v_domain IS NULL OR v_domain = '' THEN
    RETURN NULL;
  END IF;
  
  SELECT osc.sso_provider_id
  INTO v_provider_id
  FROM public.saml_domain_mappings sdm
  JOIN public.org_saml_connections osc ON osc.id = sdm.sso_connection_id
  WHERE sdm.domain = v_domain
    AND sdm.verified = true
    AND osc.enabled = true
  ORDER BY sdm.priority DESC, osc.created_at DESC
  LIMIT 1;
  
  RETURN v_provider_id;
END;
$$;

COMMENT ON FUNCTION public.lookup_sso_provider_for_email IS 'Returns the SSO provider ID for an email address if one exists';

-- ============================================================================
-- FUNCTIONS: Auto-Enrollment (FINAL VERSION WITH auto_join_enabled CHECK)
-- ============================================================================

-- Function to auto-enroll SSO-authenticated user to their organization
CREATE OR REPLACE FUNCTION public.auto_enroll_sso_user(
  p_user_id uuid,
  p_email text,
  p_sso_provider_id uuid
)
RETURNS TABLE (
  enrolled_org_id uuid,
  org_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org record;
  v_already_member boolean;
  v_stored_email text;
BEGIN
  -- Validate caller identity: p_user_id must match authenticated user
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: user_id mismatch';
  END IF;
  
  -- Validate email matches the stored email for this user
  SELECT email INTO v_stored_email FROM auth.users WHERE id = p_user_id;
  IF v_stored_email IS NULL OR lower(v_stored_email) != lower(p_email) THEN
    RAISE EXCEPTION 'Unauthorized: email mismatch';
  END IF;
  
  -- Find organizations with this SSO provider that have auto-join enabled
  FOR v_org IN
    SELECT DISTINCT 
      osc.org_id,
      o.name as org_name
    FROM public.org_saml_connections osc
    JOIN public.orgs o ON o.id = osc.org_id
    WHERE osc.sso_provider_id = p_sso_provider_id
      AND osc.enabled = true
      AND osc.auto_join_enabled = true  -- Only enroll if auto-join is enabled
  LOOP
    -- Check if already a member
    SELECT EXISTS (
      SELECT 1 FROM public.org_users 
      WHERE user_id = p_user_id AND org_id = v_org.org_id
    ) INTO v_already_member;
    
    IF NOT v_already_member THEN
      -- Add user to organization with read permission
      INSERT INTO public.org_users (user_id, org_id, user_right, created_at)
      VALUES (p_user_id, v_org.org_id, 'read', now());
      
      -- Log the auto-enrollment
      INSERT INTO public.sso_audit_logs (
        user_id,
        email,
        event_type,
        org_id,
        sso_provider_id,
        metadata
      ) VALUES (
        p_user_id,
        p_email,
        'auto_join_success',
        v_org.org_id,
        p_sso_provider_id,
        jsonb_build_object(
          'enrollment_method', 'sso_auto_join',
          'timestamp', now()
        )
      );
      
      -- Return enrolled org
      enrolled_org_id := v_org.org_id;
      org_name := v_org.org_name;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.auto_enroll_sso_user IS 'Automatically enrolls SSO user to their organization ONLY if both SSO enabled AND auto_join_enabled = true';

-- Function to auto-join users by email using saml_domain_mappings
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
  v_stored_email text;
BEGIN
  -- Validate caller identity: p_user_id must match authenticated user
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: user_id mismatch';
  END IF;
  
  -- Validate email matches the stored email for this user
  SELECT email INTO v_stored_email FROM auth.users WHERE id = p_user_id;
  IF v_stored_email IS NULL OR lower(v_stored_email) != lower(p_email) THEN
    RAISE EXCEPTION 'Unauthorized: email mismatch';
  END IF;
  
  v_domain := lower(split_part(p_email, '@', 2));
  
  IF v_domain IS NULL OR v_domain = '' THEN
    RETURN;
  END IF;
  
  -- Priority 1: SSO provider-based enrollment (strongest binding)
  IF p_sso_provider_id IS NOT NULL THEN
    PERFORM public.auto_enroll_sso_user(p_user_id, p_email, p_sso_provider_id);
    RETURN;  -- SSO enrollment takes precedence
  END IF;
  
  -- Priority 2: SAML domain mappings based enrollment
  -- Check saml_domain_mappings table for matching domains
  FOR v_org IN 
    SELECT DISTINCT o.id, o.name
    FROM public.orgs o
    INNER JOIN public.saml_domain_mappings sdm ON sdm.org_id = o.id
    WHERE sdm.domain = v_domain
      AND sdm.verified = true
      AND NOT EXISTS (
        SELECT 1 FROM public.org_users ou 
        WHERE ou.user_id = p_user_id AND ou.org_id = o.id
      )
  LOOP
    -- Add user to org with read permission
    -- Use conditional INSERT to avoid conflicts
    INSERT INTO public.org_users (user_id, org_id, user_right, created_at)
    SELECT p_user_id, v_org.id, 'read', now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.org_users ou
      WHERE ou.user_id = p_user_id AND ou.org_id = v_org.id
    );
    
    -- Log domain-based auto-join
    INSERT INTO public.sso_audit_logs (
      user_id,
      email,
      event_type,
      org_id,
      metadata
    ) VALUES (
      p_user_id,
      p_email,
      'auto_join_success',
      v_org.id,
      jsonb_build_object(
        'enrollment_method', 'saml_domain_mapping',
        'domain', v_domain
      )
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.auto_join_user_to_orgs_by_email IS 'Auto-enrolls users via SSO provider or SAML domain mappings. Does not use allowed_email_domains column.';

-- ============================================================================
-- TRIGGER FUNCTIONS: Auto-Join Logic (FINAL VERSION WITH ALL FIXES)
-- ============================================================================

-- Trigger function for user creation (called on INSERT to auth.users)
CREATE OR REPLACE FUNCTION public.trigger_auto_join_on_user_create()
RETURNS TRIGGER
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
  
  -- Extract SSO provider ID from metadata
  v_sso_provider_id := public.get_sso_provider_id_for_user(NEW.id);
  
  -- If no SSO provider, try looking it up by domain
  IF v_sso_provider_id IS NULL THEN
    v_sso_provider_id := public.lookup_sso_provider_for_email(v_email);
  END IF;
  
  -- Perform auto-join with the provider ID (if found)
  PERFORM public.auto_join_user_to_orgs_by_email(NEW.id, v_email, v_sso_provider_id);
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trigger_auto_join_on_user_create IS 'Auto-enrolls new users on account creation';

-- Trigger function for user update (called on UPDATE to auth.users)
CREATE OR REPLACE FUNCTION public.trigger_auto_join_on_user_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_sso_provider_id uuid;
  v_already_enrolled boolean;
BEGIN
  -- Only process if email confirmation changed or SSO metadata added
  IF OLD.email_confirmed_at IS NOT DISTINCT FROM NEW.email_confirmed_at 
     AND OLD.raw_app_meta_data IS NOT DISTINCT FROM NEW.raw_app_meta_data 
     AND OLD.raw_user_meta_data IS NOT DISTINCT FROM NEW.raw_user_meta_data THEN
    RETURN NEW;
  END IF;
  
  v_email := COALESCE(NEW.raw_user_meta_data->>'email', NEW.email);
  
  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get SSO provider ID from user metadata
  v_sso_provider_id := public.get_sso_provider_id_for_user(NEW.id);
  
  -- Only proceed with SSO auto-join if provider ID exists
  IF v_sso_provider_id IS NOT NULL THEN
    -- Check if user is already enrolled in an org with this SSO provider
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
-- TRIGGER FUNCTION: Enforce SSO for Domains (FINAL VERSION WITH METADATA BYPASS)
-- ============================================================================

-- Function to enforce SSO for configured domains (with metadata bypass)
CREATE OR REPLACE FUNCTION public.enforce_sso_for_domains()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_domain text;
  v_sso_required boolean;
  v_provider_count integer;
  v_metadata_provider_id uuid;
  v_metadata_allows boolean := false;
BEGIN
  IF TG_OP != 'INSERT' THEN
    RETURN NEW;
  END IF;

  v_email := COALESCE(
    NEW.raw_user_meta_data->>'email',
    NEW.email
  );

  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;

  v_domain := lower(split_part(v_email, '@', 2));

  -- Try to read the SSO provider ID that a trusted SSO flow would set on the
  -- user row. If present and it matches the verified domain entry, allow the
  -- insert to proceed before blocking emails.
  BEGIN
    v_metadata_provider_id := NULLIF(NEW.raw_user_meta_data->>'sso_provider_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_metadata_provider_id := NULL;
  END;

  IF v_metadata_provider_id IS NULL THEN
    BEGIN
      v_metadata_provider_id := NULLIF(NEW.raw_app_meta_data->>'sso_provider_id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_metadata_provider_id := NULL;
    END;
  END IF;

  IF v_metadata_provider_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.saml_domain_mappings sdm
      JOIN public.org_saml_connections osc ON osc.id = sdm.sso_connection_id
      WHERE sdm.domain = v_domain
        AND sdm.verified = true
        AND osc.enabled = true
        AND osc.sso_provider_id = v_metadata_provider_id
    ) INTO v_metadata_allows;

    IF v_metadata_allows THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Check if this is an SSO signup (will have provider info in auth.identities)
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
      USING ERRCODE = 'CAPCR',
            HINT = 'Your organization requires SSO authentication';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_sso_for_domains IS 'Trigger function to enforce SSO for configured email domains';

-- ============================================================================
-- TRIGGER FUNCTION: Validation and Audit
-- ============================================================================

-- Validation trigger for SSO configuration
CREATE OR REPLACE FUNCTION public.validate_sso_configuration()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Validate metadata exists
  IF NEW.metadata_url IS NULL AND NEW.metadata_xml IS NULL THEN
    RAISE EXCEPTION 'Either metadata_url or metadata_xml must be provided';
  END IF;
  
  -- Validate entity_id format
  IF NEW.entity_id IS NULL OR NEW.entity_id = '' THEN
    RAISE EXCEPTION 'entity_id is required';
  END IF;
  
  -- Update timestamp
  NEW.updated_at := now();
  
  -- Log configuration change
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.sso_audit_logs (
      event_type,
      org_id,
      sso_provider_id,
      metadata
    ) VALUES (
      'config_created',
      NEW.org_id,
      NEW.sso_provider_id,
      jsonb_build_object(
        'provider_name', NEW.provider_name,
        'entity_id', NEW.entity_id,
        'created_by', NEW.created_by
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.sso_audit_logs (
      event_type,
      org_id,
      sso_provider_id,
      metadata
    ) VALUES (
      'config_updated',
      NEW.org_id,
      NEW.sso_provider_id,
      jsonb_build_object(
        'provider_name', NEW.provider_name,
        'changes', jsonb_build_object(
          'enabled', jsonb_build_object('old', OLD.enabled, 'new', NEW.enabled),
          'verified', jsonb_build_object('old', OLD.verified, 'new', NEW.verified)
        )
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_sso_configuration IS 'Validates SSO configuration and logs changes';

-- ============================================================================
-- TRIGGERS: Create All Triggers
-- ============================================================================

-- Drop existing triggers to ensure clean state
DROP TRIGGER IF EXISTS auto_join_user_to_orgs_on_create ON auth.users;

DROP TRIGGER IF EXISTS auto_join_user_to_orgs_on_update ON auth.users;

DROP TRIGGER IF EXISTS sso_user_auto_enroll_on_create ON auth.users;

DROP TRIGGER IF EXISTS check_sso_domain_on_signup_trigger ON auth.users;

DROP TRIGGER IF EXISTS trigger_validate_sso_configuration ON public.org_saml_connections;

-- Create auto-join trigger for user creation
CREATE TRIGGER auto_join_user_to_orgs_on_create
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_auto_join_on_user_create();

-- Create auto-join trigger for user updates
CREATE TRIGGER auto_join_user_to_orgs_on_update
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_auto_join_on_user_update();

-- Create SSO domain enforcement trigger
CREATE TRIGGER check_sso_domain_on_signup_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_sso_for_domains();

-- Create SSO configuration validation trigger
CREATE TRIGGER trigger_validate_sso_configuration
  BEFORE INSERT OR UPDATE ON public.org_saml_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_sso_configuration();

COMMENT ON TRIGGER trigger_validate_sso_configuration ON public.org_saml_connections IS 'Validates SSO config and logs changes';

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.org_saml_connections ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.saml_domain_mappings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sso_audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies first (idempotent)
DROP POLICY IF EXISTS "Super admins can manage SSO connections" ON public.org_saml_connections;

DROP POLICY IF EXISTS "Org members can read SSO status" ON public.org_saml_connections;

DROP POLICY IF EXISTS "Anyone can read verified domain mappings" ON public.saml_domain_mappings;

DROP POLICY IF EXISTS "Super admins can manage domain mappings" ON public.saml_domain_mappings;

DROP POLICY IF EXISTS "Users can view own SSO audit logs" ON public.sso_audit_logs;

DROP POLICY IF EXISTS "Org admins can view org SSO audit logs" ON public.sso_audit_logs;

DROP POLICY IF EXISTS "System can insert audit logs" ON public.sso_audit_logs;

-- ============================================================================
-- RLS POLICIES: org_saml_connections
-- ============================================================================

-- Super admins can manage SSO connections
CREATE POLICY "Super admins can manage SSO connections"
  ON public.org_saml_connections
  FOR ALL
  TO authenticated
  USING (
    public.check_min_rights(
      'super_admin'::public.user_min_right,
      public.get_identity_org_allowed('{all,write}'::public.key_mode[], org_id),
      org_id,
      NULL::character varying,
      NULL::bigint
    )
  )
  WITH CHECK (
    public.check_min_rights(
      'super_admin'::public.user_min_right,
      public.get_identity_org_allowed('{all,write}'::public.key_mode[], org_id),
      org_id,
      NULL::character varying,
      NULL::bigint
    )
  );

-- Org members can read their org's SSO status (for UI display)
CREATE POLICY "Org members can read SSO status"
  ON public.org_saml_connections
  FOR SELECT
  TO authenticated
  USING (
    public.check_min_rights(
      'read'::public.user_min_right,
      public.get_identity_org_allowed('{read,write,all}'::public.key_mode[], org_id),
      org_id,
      NULL::character varying,
      NULL::bigint
    )
  );

-- ============================================================================
-- RLS POLICIES: saml_domain_mappings
-- ============================================================================

-- Anyone (including anon) can read verified domain mappings for SSO detection
CREATE POLICY "Anyone can read verified domain mappings" ON public.saml_domain_mappings FOR
SELECT TO authenticated, anon USING (verified = true);

-- Super admins can manage domain mappings
CREATE POLICY "Super admins can manage domain mappings"
  ON public.saml_domain_mappings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_saml_connections osc
      WHERE osc.id = sso_connection_id
        AND public.check_min_rights(
          'super_admin'::public.user_min_right,
          public.get_identity_org_allowed('{all,write}'::public.key_mode[], osc.org_id),
          osc.org_id,
          NULL::character varying,
          NULL::bigint
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_saml_connections osc
      WHERE osc.id = sso_connection_id
        AND public.check_min_rights(
          'super_admin'::public.user_min_right,
          public.get_identity_org_allowed('{all,write}'::public.key_mode[], osc.org_id),
          osc.org_id,
          NULL::character varying,
          NULL::bigint
        )
    )
  );

-- ============================================================================
-- RLS POLICIES: sso_audit_logs
-- ============================================================================

-- Users can view their own audit logs
CREATE POLICY "Users can view own SSO audit logs" ON public.sso_audit_logs FOR
SELECT TO authenticated USING (user_id = auth.uid ());

-- Org admins can view org audit logs
CREATE POLICY "Org admins can view org SSO audit logs"
  ON public.sso_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND public.check_min_rights(
      'admin'::public.user_min_right,
      public.get_identity_org_allowed('{read,write,all}'::public.key_mode[], org_id),
      org_id,
      NULL::character varying,
      NULL::bigint
    )
  );

-- Note: No INSERT policy needed for sso_audit_logs since SECURITY DEFINER
-- functions bypass RLS. Only service_role should insert directly.

-- ============================================================================
-- GRANTS: Ensure proper permissions
-- ============================================================================

-- Grant usage on public schema
GRANT USAGE ON SCHEMA public TO authenticated, anon;

-- Grant access to tables
GRANT SELECT ON public.org_saml_connections TO authenticated, anon;

GRANT SELECT ON public.saml_domain_mappings TO authenticated, anon;

GRANT SELECT ON public.sso_audit_logs TO authenticated;

-- Grant function execution to authenticated users and anon for SSO detection
GRANT EXECUTE ON FUNCTION public.check_sso_required_for_domain TO authenticated, anon;

GRANT
EXECUTE ON FUNCTION public.check_org_sso_configured TO authenticated,
anon;

GRANT
EXECUTE ON FUNCTION public.get_sso_provider_id_for_user TO authenticated;

GRANT
EXECUTE ON FUNCTION public.org_has_sso_configured (uuid) TO authenticated;

GRANT
EXECUTE ON FUNCTION public.lookup_sso_provider_by_domain TO authenticated,
anon;

GRANT
EXECUTE ON FUNCTION public.lookup_sso_provider_for_email TO authenticated,
anon;

GRANT
EXECUTE ON FUNCTION public.auto_enroll_sso_user TO authenticated;

GRANT
EXECUTE ON FUNCTION public.auto_join_user_to_orgs_by_email TO authenticated;

-- Revoke public/authenticated access to trigger functions (DB triggers only)
REVOKE
EXECUTE ON FUNCTION public.trigger_auto_join_on_user_create
FROM PUBLIC;

REVOKE
EXECUTE ON FUNCTION public.trigger_auto_join_on_user_update
FROM PUBLIC;

-- Grant special permissions to auth admin for trigger functions
GRANT
EXECUTE ON FUNCTION public.get_sso_provider_id_for_user TO postgres,
supabase_auth_admin;

GRANT
EXECUTE ON FUNCTION public.trigger_auto_join_on_user_create TO postgres,
supabase_auth_admin;

GRANT
EXECUTE ON FUNCTION public.trigger_auto_join_on_user_update TO postgres,
supabase_auth_admin;