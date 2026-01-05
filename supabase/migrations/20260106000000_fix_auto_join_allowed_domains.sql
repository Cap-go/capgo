-- Fix auto_join_user_to_orgs_by_email to remove reference to non-existent allowed_email_domains column
-- Drop all variants of the function to ensure clean slate
DROP FUNCTION IF EXISTS public.auto_join_user_to_orgs_by_email(uuid);
DROP FUNCTION IF EXISTS public.auto_join_user_to_orgs_by_email(uuid, text);
DROP FUNCTION IF EXISTS public.auto_join_user_to_orgs_by_email(uuid, text, uuid);

-- Recreate with correct implementation using saml_domain_mappings only
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
BEGIN
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
    INSERT INTO public.org_users (user_id, org_id, user_right, created_at)
    VALUES (p_user_id, v_org.id, 'read', now())
    ON CONFLICT (user_id, org_id) DO NOTHING;
    
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
