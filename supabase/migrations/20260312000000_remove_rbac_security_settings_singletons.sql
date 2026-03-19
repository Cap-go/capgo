-- ============================================================================
-- Use environment variables instead of singleton settings tables.
-- ============================================================================

-- Drop any policies that may have been created on the legacy setting tables.
DROP POLICY IF EXISTS rbac_settings_read_authenticated ON public.rbac_settings;
DROP POLICY IF EXISTS rbac_settings_admin_all ON public.rbac_settings;
DROP POLICY IF EXISTS rbac_settings_select ON public.rbac_settings;
DROP POLICY IF EXISTS rbac_settings_insert ON public.rbac_settings;
DROP POLICY IF EXISTS rbac_settings_update ON public.rbac_settings;
DROP POLICY IF EXISTS rbac_settings_delete ON public.rbac_settings;
DROP POLICY IF EXISTS rbac_settings_no_select ON public.rbac_settings;
DROP POLICY IF EXISTS rbac_settings_no_insert ON public.rbac_settings;
DROP POLICY IF EXISTS rbac_settings_no_update ON public.rbac_settings;
DROP POLICY IF EXISTS rbac_settings_no_delete ON public.rbac_settings;
DROP POLICY IF EXISTS "Deny access to security settings" ON public.security_settings;

-- Remove singleton tables.
DROP TABLE IF EXISTS public.rbac_settings CASCADE;
DROP TABLE IF EXISTS public.security_settings CASCADE;

-- ============================================================================
-- RBAC global setting from environment
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_rbac_enabled_globally()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_setting text;
BEGIN
  SELECT decrypted_secret
  INTO v_setting
  FROM vault.decrypted_secrets
  WHERE name = 'CAPGO_RBAC_ENABLED'
  LIMIT 1;

  IF v_setting IS NULL OR btrim(v_setting) = '' THEN
    RETURN false;
  END IF;

  RETURN lower(v_setting) IN ('1', 'true', 'on', 'yes');
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_is_enabled_for_org(
    p_org_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_org_enabled boolean;
BEGIN
  SELECT use_new_rbac INTO v_org_enabled FROM public.orgs WHERE id = p_org_id;
  RETURN COALESCE(v_org_enabled, false) OR public.is_rbac_enabled_globally();
END;
$$;

COMMENT ON FUNCTION public.rbac_is_enabled_for_org(uuid) IS
'Feature-flag gate for RBAC. Defaults to false; true when org or global env setting is enabled.';

-- ============================================================================
-- Email OTP enforcement threshold from environment
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_mfa_email_otp_enforced_at()
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_setting text;
BEGIN
  SELECT decrypted_secret
  INTO v_setting
  FROM vault.decrypted_secrets
  WHERE name = 'CAPGO_MFA_EMAIL_OTP_ENFORCED_AT'
  LIMIT 1;

  IF v_setting IS NULL OR btrim(v_setting) = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    RETURN v_setting::timestamptz;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
END;
$$;

DO $$
DECLARE
  v_can_manage_auth boolean := has_schema_privilege('auth', 'CREATE');
BEGIN
  IF NOT v_can_manage_auth THEN
    RAISE NOTICE 'Skipping auth.enforce_email_otp_for_mfa setup (insufficient privileges on auth schema)';
    RETURN;
  END IF;

  BEGIN
    CREATE OR REPLACE FUNCTION "auth"."enforce_email_otp_for_mfa"() RETURNS trigger
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $body$
    DECLARE
      otp_ok boolean;
      enforced_at timestamptz;
      user_created_at timestamptz;
    BEGIN
      enforced_at := public.get_mfa_email_otp_enforced_at();

      IF enforced_at IS NOT NULL THEN
        SELECT auth.users.created_at
        INTO user_created_at
        FROM auth.users
        WHERE auth.users.id = NEW.user_id;

        IF user_created_at IS NOT NULL AND user_created_at < enforced_at THEN
          RETURN NEW;
        END IF;
      END IF;

      IF TG_OP = 'INSERT' THEN
        otp_ok := public.is_recent_email_otp_verified(NEW.user_id);
        IF NOT otp_ok THEN
          RAISE EXCEPTION 'email otp verification required for mfa enrollment';
        END IF;
        RETURN NEW;
      END IF;

      IF TG_OP = 'UPDATE'
        AND (NEW.status IS DISTINCT FROM OLD.status)
        AND NEW.status = 'verified' THEN
        otp_ok := public.is_recent_email_otp_verified(NEW.user_id);
        IF NOT otp_ok THEN
          RAISE EXCEPTION 'email otp verification required for mfa enrollment';
        END IF;
      END IF;

      RETURN NEW;
    END;
    $body$;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping auth.enforce_email_otp_for_mfa setup (insufficient privileges)';
      RETURN;
    WHEN OTHERS THEN
      RAISE NOTICE 'Skipping auth.enforce_email_otp_for_mfa setup: %', SQLERRM;
      RETURN;
  END;

  BEGIN
    EXECUTE 'ALTER FUNCTION "auth"."enforce_email_otp_for_mfa"() OWNER TO "postgres"';
    EXECUTE 'DROP TRIGGER IF EXISTS "trg_enforce_email_otp_for_mfa" ON auth.mfa_factors';
    EXECUTE 'CREATE TRIGGER "trg_enforce_email_otp_for_mfa" BEFORE INSERT OR UPDATE ON auth.mfa_factors FOR EACH ROW EXECUTE FUNCTION auth.enforce_email_otp_for_mfa()';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping auth.mfa_factors trigger setup (insufficient privileges)';
  END;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping auth.mfa_factors trigger setup (insufficient privileges)';
END;
$$;
