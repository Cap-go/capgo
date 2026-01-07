-- Fix auto_enroll_sso_user to respect auto_join_enabled flag
-- Previously it only checked if SSO was enabled, not if auto-join was enabled

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
BEGIN
  -- Find organizations with this SSO provider that have auto-join enabled
  FOR v_org IN
    SELECT DISTINCT 
      osc.org_id,
      o.name as org_name
    FROM public.org_saml_connections osc
    JOIN public.orgs o ON o.id = osc.org_id
    WHERE osc.sso_provider_id = p_sso_provider_id
      AND osc.enabled = true
      AND osc.auto_join_enabled = true  -- NEW: Check auto-join flag
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
