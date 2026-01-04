-- SSO Auto-Join Fixes
-- Addresses review comments for improved reliability and security

-- ============================================================================
-- FIX #1: verify_org_domain - Accept user_id parameter for service-role calls
-- ============================================================================

CREATE OR REPLACE FUNCTION public.verify_org_domain(
  p_domain_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id uuid;
  v_effective_user_id uuid;
BEGIN
  -- Use provided user_id or fall back to auth.uid()
  v_effective_user_id := COALESCE(p_user_id, auth.uid());

  -- Get org_id for the domain
  SELECT org_id INTO v_org_id FROM public.org_domains WHERE id = p_domain_id;

  IF v_org_id IS NULL THEN
    RETURN 'DOMAIN_NOT_FOUND';
  END IF;

  -- Check if user has super_admin rights
  IF NOT public.check_min_rights('super_admin'::public.user_min_right, v_effective_user_id, v_org_id, NULL::varchar, NULL::bigint) THEN
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

-- ============================================================================
-- FIX #2: Normalize email domains with lower() in auto-join trigger
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
  -- Extract domain from email and normalize to lowercase
  user_domain := lower(split_part(NEW.email, '@', 2));

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
      -- FIX #8: Handle insert failures gracefully
      BEGIN
        INSERT INTO public.org_users (user_id, org_id, user_right)
        VALUES (NEW.id, domain_record.org_id, domain_record.auto_join_role);
      EXCEPTION WHEN unique_violation THEN
        -- Race condition: user was added by another process, ignore
        NULL;
      END;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- FIX #2 & #8 & #9: Backfill trigger with lowercased domain comparison,
-- error handling, and batching for large domains
-- ============================================================================

CREATE OR REPLACE FUNCTION public.backfill_domain_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  batch_size integer := 1000;
  affected_count integer;
BEGIN
  -- Only run when verified changes from false to true
  IF NEW.verified = true AND (OLD.verified = false OR OLD.verified IS NULL) THEN
    -- Only backfill if org is Enterprise
    IF public.is_enterprise_org(NEW.org_id) THEN
      -- Process in batches to avoid long-running transactions
      LOOP
        -- Insert batch of users, using lower() for case-insensitive matching
        WITH batch AS (
          SELECT u.id as user_id
          FROM public.users u
          WHERE lower(split_part(u.email, '@', 2)) = lower(NEW.domain)
            AND NOT EXISTS (
              SELECT 1 FROM public.org_users ou
              WHERE ou.user_id = u.id AND ou.org_id = NEW.org_id
            )
          LIMIT batch_size
        )
        INSERT INTO public.org_users (user_id, org_id, user_right)
        SELECT batch.user_id, NEW.org_id, NEW.auto_join_role
        FROM batch
        ON CONFLICT (user_id, org_id) DO NOTHING;

        GET DIAGNOSTICS affected_count = ROW_COUNT;

        -- Exit loop when no more users to process
        EXIT WHEN affected_count < batch_size;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- FIX #1: Also update other RPC functions that use auth.uid() to accept user_id
-- ============================================================================

-- Update remove_org_domain to accept optional user_id
CREATE OR REPLACE FUNCTION public.remove_org_domain(
  p_domain_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id uuid;
  v_effective_user_id uuid;
BEGIN
  v_effective_user_id := COALESCE(p_user_id, auth.uid());

  -- Get org_id for the domain
  SELECT org_id INTO v_org_id FROM public.org_domains WHERE id = p_domain_id;

  IF v_org_id IS NULL THEN
    RETURN 'DOMAIN_NOT_FOUND';
  END IF;

  -- Check if user has super_admin rights
  IF NOT public.check_min_rights('super_admin'::public.user_min_right, v_effective_user_id, v_org_id, NULL::varchar, NULL::bigint) THEN
    RETURN 'NO_RIGHTS';
  END IF;

  -- Delete domain
  DELETE FROM public.org_domains WHERE id = p_domain_id;

  RETURN 'OK';
END;
$$;

-- Update update_org_domain_settings to accept optional user_id
CREATE OR REPLACE FUNCTION public.update_org_domain_settings(
  p_domain_id uuid,
  p_auto_join_enabled boolean DEFAULT NULL,
  p_auto_join_role public.user_min_right DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id uuid;
  v_effective_user_id uuid;
BEGIN
  v_effective_user_id := COALESCE(p_user_id, auth.uid());

  -- Get org_id for the domain
  SELECT org_id INTO v_org_id FROM public.org_domains WHERE id = p_domain_id;

  IF v_org_id IS NULL THEN
    RETURN 'DOMAIN_NOT_FOUND';
  END IF;

  -- Check if user has super_admin rights
  IF NOT public.check_min_rights('super_admin'::public.user_min_right, v_effective_user_id, v_org_id, NULL::varchar, NULL::bigint) THEN
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

-- Update add_org_domain to accept optional user_id
CREATE OR REPLACE FUNCTION public.add_org_domain(
  p_org_id uuid,
  p_domain varchar,
  p_user_id uuid DEFAULT NULL
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
  v_effective_user_id uuid;
BEGIN
  v_effective_user_id := COALESCE(p_user_id, auth.uid());

  -- Check if user has super_admin rights
  IF NOT public.check_min_rights('super_admin'::public.user_min_right, v_effective_user_id, p_org_id, NULL::varchar, NULL::bigint) THEN
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

-- Update upsert_org_sso_provider to accept optional user_id
CREATE OR REPLACE FUNCTION public.upsert_org_sso_provider(
  p_org_id uuid,
  p_supabase_sso_provider_id uuid DEFAULT NULL,
  p_provider_type varchar DEFAULT 'saml',
  p_display_name varchar DEFAULT NULL,
  p_metadata_url text DEFAULT NULL,
  p_enabled boolean DEFAULT false,
  p_user_id uuid DEFAULT NULL
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
  v_effective_user_id uuid;
BEGIN
  v_effective_user_id := COALESCE(p_user_id, auth.uid());

  -- Check if user has super_admin rights
  IF NOT public.check_min_rights('super_admin'::public.user_min_right, v_effective_user_id, p_org_id, NULL::varchar, NULL::bigint) THEN
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

-- Update delete_org_sso_provider to accept optional user_id
CREATE OR REPLACE FUNCTION public.delete_org_sso_provider(
  p_org_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_effective_user_id uuid;
BEGIN
  v_effective_user_id := COALESCE(p_user_id, auth.uid());

  -- Check if user has super_admin rights
  IF NOT public.check_min_rights('super_admin'::public.user_min_right, v_effective_user_id, p_org_id, NULL::varchar, NULL::bigint) THEN
    RETURN 'NO_RIGHTS';
  END IF;

  -- Delete SSO provider
  DELETE FROM public.org_sso_providers WHERE org_id = p_org_id;

  RETURN 'OK';
END;
$$;

-- Update count_domain_users to use lower() for case-insensitive matching
CREATE OR REPLACE FUNCTION public.count_domain_users(
  p_domain varchar,
  p_org_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_effective_user_id uuid;
BEGIN
  v_effective_user_id := COALESCE(p_user_id, auth.uid());

  -- Check if user has admin rights
  IF NOT public.check_min_rights('admin'::public.user_min_right, v_effective_user_id, p_org_id, NULL::varchar, NULL::bigint) THEN
    RETURN -1;
  END IF;

  SELECT COUNT(*)::integer INTO v_count
  FROM public.users u
  WHERE lower(split_part(u.email, '@', 2)) = lower(p_domain)
    AND NOT EXISTS (
      SELECT 1 FROM public.org_users ou
      WHERE ou.user_id = u.id AND ou.org_id = p_org_id
    );

  RETURN v_count;
END;
$$;
