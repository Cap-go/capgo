-- ============================================================================
-- Move MFA email OTP enforcement trigger function out of the auth schema.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_email_otp_for_mfa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

ALTER FUNCTION public.enforce_email_otp_for_mfa() OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_enforce_email_otp_for_mfa ON auth.mfa_factors;

CREATE TRIGGER trg_enforce_email_otp_for_mfa
BEFORE INSERT OR UPDATE ON auth.mfa_factors
FOR EACH ROW
EXECUTE FUNCTION public.enforce_email_otp_for_mfa();

DO $$
BEGIN
  BEGIN
    EXECUTE 'DROP FUNCTION IF EXISTS auth.enforce_email_otp_for_mfa()';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping cleanup of auth.enforce_email_otp_for_mfa() (insufficient privileges)';
  END;
END;
$$;
