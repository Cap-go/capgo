-- SSO Auto-Join Feature
-- Allows Enterprise organizations to configure SAML SSO and auto-join users by email domain

-- ============================================================================
-- TABLES
-- ============================================================================

-- Store SSO provider configuration per org
CREATE TABLE IF NOT EXISTS public.org_sso_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  supabase_sso_provider_id uuid, -- ID from Supabase SSO system
  provider_type varchar NOT NULL DEFAULT 'saml',
  display_name varchar,
  metadata_url text,
  enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id)
);

-- Store claimed domains per org
CREATE TABLE IF NOT EXISTS public.org_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  domain varchar NOT NULL,
  verified boolean DEFAULT false,
  verification_token varchar,
  verified_at timestamptz,
  auto_join_enabled boolean DEFAULT true,
  auto_join_role public.user_min_right DEFAULT 'read'::public.user_min_right,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(domain) -- Each domain can only be claimed once globally
);

-- Index for domain lookup during auto-join
CREATE INDEX IF NOT EXISTS idx_org_domains_domain ON public.org_domains(domain) WHERE verified = true;
CREATE INDEX IF NOT EXISTS idx_org_domains_org_id ON public.org_domains(org_id);
CREATE INDEX IF NOT EXISTS idx_org_sso_providers_org_id ON public.org_sso_providers(org_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE public.org_sso_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_domains ENABLE ROW LEVEL SECURITY;

-- SSO Providers: super_admins can manage, admins can read
CREATE POLICY "Super admins manage SSO providers" ON public.org_sso_providers
  FOR ALL TO authenticated
  USING (public.check_min_rights('super_admin'::public.user_min_right, auth.uid(), org_id, NULL::varchar, NULL::bigint));

CREATE POLICY "Admins can read SSO providers" ON public.org_sso_providers
  FOR SELECT TO authenticated
  USING (public.check_min_rights('admin'::public.user_min_right, auth.uid(), org_id, NULL::varchar, NULL::bigint));

-- Domains: super_admins can manage, admins can read
CREATE POLICY "Super admins manage domains" ON public.org_domains
  FOR ALL TO authenticated
  USING (public.check_min_rights('super_admin'::public.user_min_right, auth.uid(), org_id, NULL::varchar, NULL::bigint));

CREATE POLICY "Admins can read domains" ON public.org_domains
  FOR SELECT TO authenticated
  USING (public.check_min_rights('admin'::public.user_min_right, auth.uid(), org_id, NULL::varchar, NULL::bigint));

-- ============================================================================
-- HELPER FUNCTION: Check if org has Enterprise plan
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_enterprise_org(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan_name text;
BEGIN
  SELECT p.name INTO v_plan_name
  FROM public.orgs o
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  LEFT JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = p_org_id;

  RETURN v_plan_name = 'Enterprise';
END;
$$;

-- ============================================================================
-- AUTO-JOIN TRIGGER: Add new users to org based on email domain
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_sso_auto_join()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_domain text;
  domain_record record;
BEGIN
  -- Extract domain from email
  user_domain := split_part(NEW.email, '@', 2);

  -- Find verified domain with auto-join enabled for Enterprise org
  FOR domain_record IN
    SELECT od.org_id, od.auto_join_role
    FROM public.org_domains od
    WHERE od.domain = user_domain
      AND od.verified = true
      AND od.auto_join_enabled = true
      AND public.is_enterprise_org(od.org_id)
  LOOP
    -- Check if user already in org
    IF NOT EXISTS (
      SELECT 1 FROM public.org_users
      WHERE user_id = NEW.id AND org_id = domain_record.org_id
    ) THEN
      INSERT INTO public.org_users (user_id, org_id, user_right)
      VALUES (NEW.id, domain_record.org_id, domain_record.auto_join_role);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger on users table for new user creation
DROP TRIGGER IF EXISTS on_user_created_sso_auto_join ON public.users;
CREATE TRIGGER on_user_created_sso_auto_join
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_sso_auto_join();

-- ============================================================================
-- AUTO-BACKFILL TRIGGER: Add existing users when domain is verified
-- ============================================================================

CREATE OR REPLACE FUNCTION public.backfill_domain_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only run when verified changes from false to true
  IF NEW.verified = true AND (OLD.verified = false OR OLD.verified IS NULL) THEN
    -- Only backfill if org is Enterprise
    IF public.is_enterprise_org(NEW.org_id) THEN
      INSERT INTO public.org_users (user_id, org_id, user_right)
      SELECT u.id, NEW.org_id, NEW.auto_join_role
      FROM public.users u
      WHERE split_part(u.email, '@', 2) = NEW.domain
        AND NOT EXISTS (
          SELECT 1 FROM public.org_users ou
          WHERE ou.user_id = u.id AND ou.org_id = NEW.org_id
        );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger on domain verification
DROP TRIGGER IF EXISTS on_domain_verified_backfill ON public.org_domains;
CREATE TRIGGER on_domain_verified_backfill
  AFTER UPDATE ON public.org_domains
  FOR EACH ROW
  EXECUTE FUNCTION public.backfill_domain_users();

-- ============================================================================
-- HELPER FUNCTIONS FOR SSO MANAGEMENT
-- ============================================================================

-- Get SSO config for an org
CREATE OR REPLACE FUNCTION public.get_org_sso_config(p_org_id uuid)
RETURNS TABLE (
  id uuid,
  org_id uuid,
  supabase_sso_provider_id uuid,
  provider_type varchar,
  display_name varchar,
  metadata_url text,
  enabled boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Check if user has at least admin rights
  IF NOT public.check_min_rights('admin'::public.user_min_right, auth.uid(), p_org_id, NULL::varchar, NULL::bigint) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  RETURN QUERY
  SELECT
    osp.id,
    osp.org_id,
    osp.supabase_sso_provider_id,
    osp.provider_type,
    osp.display_name,
    osp.metadata_url,
    osp.enabled,
    osp.created_at,
    osp.updated_at
  FROM public.org_sso_providers osp
  WHERE osp.org_id = p_org_id;
END;
$$;

-- Get domains for an org
CREATE OR REPLACE FUNCTION public.get_org_domains(p_org_id uuid)
RETURNS TABLE (
  id uuid,
  org_id uuid,
  domain varchar,
  verified boolean,
  verification_token varchar,
  verified_at timestamptz,
  auto_join_enabled boolean,
  auto_join_role public.user_min_right,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Check if user has at least admin rights
  IF NOT public.check_min_rights('admin'::public.user_min_right, auth.uid(), p_org_id, NULL::varchar, NULL::bigint) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  RETURN QUERY
  SELECT
    od.id,
    od.org_id,
    od.domain,
    od.verified,
    od.verification_token,
    od.verified_at,
    od.auto_join_enabled,
    od.auto_join_role,
    od.created_at,
    od.updated_at
  FROM public.org_domains od
  WHERE od.org_id = p_org_id
  ORDER BY od.created_at DESC;
END;
$$;

-- Add a domain claim
CREATE OR REPLACE FUNCTION public.add_org_domain(
  p_org_id uuid,
  p_domain varchar
)
RETURNS TABLE (
  id uuid,
  verification_token varchar,
  error_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token varchar;
  v_id uuid;
BEGIN
  -- Check if user has super_admin rights
  IF NOT public.check_min_rights('super_admin'::public.user_min_right, auth.uid(), p_org_id, NULL::varchar, NULL::bigint) THEN
    RETURN QUERY SELECT NULL::uuid, NULL::varchar, 'NO_RIGHTS'::text;
    RETURN;
  END IF;

  -- Check if org is Enterprise
  IF NOT public.is_enterprise_org(p_org_id) THEN
    RETURN QUERY SELECT NULL::uuid, NULL::varchar, 'REQUIRES_ENTERPRISE'::text;
    RETURN;
  END IF;

  -- Check if domain is already claimed
  IF EXISTS (SELECT 1 FROM public.org_domains WHERE domain = lower(p_domain)) THEN
    RETURN QUERY SELECT NULL::uuid, NULL::varchar, 'DOMAIN_ALREADY_CLAIMED'::text;
    RETURN;
  END IF;

  -- Generate verification token
  v_token := encode(gen_random_bytes(32), 'hex');

  -- Insert domain
  INSERT INTO public.org_domains (org_id, domain, verification_token)
  VALUES (p_org_id, lower(p_domain), v_token)
  RETURNING org_domains.id INTO v_id;

  RETURN QUERY SELECT v_id, v_token, NULL::text;
END;
$$;

-- Remove a domain
CREATE OR REPLACE FUNCTION public.remove_org_domain(
  p_domain_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Get org_id for the domain
  SELECT org_id INTO v_org_id FROM public.org_domains WHERE id = p_domain_id;

  IF v_org_id IS NULL THEN
    RETURN 'DOMAIN_NOT_FOUND';
  END IF;

  -- Check if user has super_admin rights
  IF NOT public.check_min_rights('super_admin'::public.user_min_right, auth.uid(), v_org_id, NULL::varchar, NULL::bigint) THEN
    RETURN 'NO_RIGHTS';
  END IF;

  -- Delete domain
  DELETE FROM public.org_domains WHERE id = p_domain_id;

  RETURN 'OK';
END;
$$;

-- Verify a domain (called after DNS check passes)
CREATE OR REPLACE FUNCTION public.verify_org_domain(
  p_domain_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Get org_id for the domain
  SELECT org_id INTO v_org_id FROM public.org_domains WHERE id = p_domain_id;

  IF v_org_id IS NULL THEN
    RETURN 'DOMAIN_NOT_FOUND';
  END IF;

  -- Check if user has super_admin rights
  IF NOT public.check_min_rights('super_admin'::public.user_min_right, auth.uid(), v_org_id, NULL::varchar, NULL::bigint) THEN
    RETURN 'NO_RIGHTS';
  END IF;

  -- Check if org is Enterprise
  IF NOT public.is_enterprise_org(v_org_id) THEN
    RETURN 'REQUIRES_ENTERPRISE';
  END IF;

  -- Update domain as verified (this will trigger backfill)
  UPDATE public.org_domains
  SET verified = true, verified_at = now(), updated_at = now()
  WHERE id = p_domain_id;

  RETURN 'OK';
END;
$$;

-- Update domain auto-join settings
CREATE OR REPLACE FUNCTION public.update_org_domain_settings(
  p_domain_id uuid,
  p_auto_join_enabled boolean DEFAULT NULL,
  p_auto_join_role public.user_min_right DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Get org_id for the domain
  SELECT org_id INTO v_org_id FROM public.org_domains WHERE id = p_domain_id;

  IF v_org_id IS NULL THEN
    RETURN 'DOMAIN_NOT_FOUND';
  END IF;

  -- Check if user has super_admin rights
  IF NOT public.check_min_rights('super_admin'::public.user_min_right, auth.uid(), v_org_id, NULL::varchar, NULL::bigint) THEN
    RETURN 'NO_RIGHTS';
  END IF;

  -- Update settings
  UPDATE public.org_domains
  SET
    auto_join_enabled = COALESCE(p_auto_join_enabled, auto_join_enabled),
    auto_join_role = COALESCE(p_auto_join_role, auto_join_role),
    updated_at = now()
  WHERE id = p_domain_id;

  RETURN 'OK';
END;
$$;

-- ============================================================================
-- SSO PROVIDER MANAGEMENT FUNCTIONS
-- ============================================================================

-- Create or update SSO provider config
CREATE OR REPLACE FUNCTION public.upsert_org_sso_provider(
  p_org_id uuid,
  p_supabase_sso_provider_id uuid DEFAULT NULL,
  p_provider_type varchar DEFAULT 'saml',
  p_display_name varchar DEFAULT NULL,
  p_metadata_url text DEFAULT NULL,
  p_enabled boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  error_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Check if user has super_admin rights
  IF NOT public.check_min_rights('super_admin'::public.user_min_right, auth.uid(), p_org_id, NULL::varchar, NULL::bigint) THEN
    RETURN QUERY SELECT NULL::uuid, 'NO_RIGHTS'::text;
    RETURN;
  END IF;

  -- Check if org is Enterprise
  IF NOT public.is_enterprise_org(p_org_id) THEN
    RETURN QUERY SELECT NULL::uuid, 'REQUIRES_ENTERPRISE'::text;
    RETURN;
  END IF;

  -- Upsert SSO provider
  INSERT INTO public.org_sso_providers (
    org_id, supabase_sso_provider_id, provider_type, display_name, metadata_url, enabled
  )
  VALUES (
    p_org_id, p_supabase_sso_provider_id, p_provider_type, p_display_name, p_metadata_url, p_enabled
  )
  ON CONFLICT (org_id) DO UPDATE SET
    supabase_sso_provider_id = COALESCE(EXCLUDED.supabase_sso_provider_id, org_sso_providers.supabase_sso_provider_id),
    provider_type = EXCLUDED.provider_type,
    display_name = EXCLUDED.display_name,
    metadata_url = EXCLUDED.metadata_url,
    enabled = EXCLUDED.enabled,
    updated_at = now()
  RETURNING org_sso_providers.id INTO v_id;

  RETURN QUERY SELECT v_id, NULL::text;
END;
$$;

-- Delete SSO provider config
CREATE OR REPLACE FUNCTION public.delete_org_sso_provider(
  p_org_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Check if user has super_admin rights
  IF NOT public.check_min_rights('super_admin'::public.user_min_right, auth.uid(), p_org_id, NULL::varchar, NULL::bigint) THEN
    RETURN 'NO_RIGHTS';
  END IF;

  -- Delete SSO provider
  DELETE FROM public.org_sso_providers WHERE org_id = p_org_id;

  RETURN 'OK';
END;
$$;

-- Count users that would be backfilled for a domain
CREATE OR REPLACE FUNCTION public.count_domain_users(
  p_domain varchar,
  p_org_id uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Check if user has admin rights
  IF NOT public.check_min_rights('admin'::public.user_min_right, auth.uid(), p_org_id, NULL::varchar, NULL::bigint) THEN
    RETURN -1;
  END IF;

  SELECT COUNT(*)::integer INTO v_count
  FROM public.users u
  WHERE split_part(u.email, '@', 2) = lower(p_domain)
    AND NOT EXISTS (
      SELECT 1 FROM public.org_users ou
      WHERE ou.user_id = u.id AND ou.org_id = p_org_id
    );

  RETURN v_count;
END;
$$;
