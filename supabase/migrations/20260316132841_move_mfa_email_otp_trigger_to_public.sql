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
REVOKE ALL ON FUNCTION public.enforce_email_otp_for_mfa() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_email_otp_for_mfa() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_email_otp_for_mfa() FROM authenticated;
REVOKE ALL ON FUNCTION public.enforce_email_otp_for_mfa() FROM service_role;
GRANT EXECUTE ON FUNCTION public.enforce_email_otp_for_mfa() TO postgres;

DO $$
DECLARE
  v_can_manage_auth_trigger boolean := has_schema_privilege(current_user, 'auth', 'USAGE')
    AND has_table_privilege(current_user, 'auth.mfa_factors', 'TRIGGER')
    AND has_function_privilege(current_user, 'public.enforce_email_otp_for_mfa()', 'EXECUTE');
BEGIN
  IF NOT v_can_manage_auth_trigger THEN
    RAISE NOTICE 'Skipping auth.mfa_factors trigger rewrite (insufficient privileges)';
    RETURN;
  END IF;

  EXECUTE 'DROP TRIGGER IF EXISTS trg_enforce_email_otp_for_mfa ON auth.mfa_factors';
  EXECUTE 'CREATE TRIGGER trg_enforce_email_otp_for_mfa BEFORE INSERT OR UPDATE ON auth.mfa_factors FOR EACH ROW EXECUTE FUNCTION public.enforce_email_otp_for_mfa()';
END;
$$;

DO $$
DECLARE
  v_has_legacy_auth_function boolean := EXISTS (
    SELECT 1
    FROM pg_proc proc
    JOIN pg_namespace ns ON ns.oid = proc.pronamespace
    WHERE ns.nspname = 'auth'
      AND proc.proname = 'enforce_email_otp_for_mfa'
      AND COALESCE(pg_get_function_identity_arguments(proc.oid), '') = ''
  );
  v_can_drop_legacy_auth_function boolean := has_schema_privilege(current_user, 'auth', 'USAGE')
    AND EXISTS (
      SELECT 1
      FROM pg_proc proc
      JOIN pg_namespace ns ON ns.oid = proc.pronamespace
      WHERE ns.nspname = 'auth'
        AND proc.proname = 'enforce_email_otp_for_mfa'
        AND COALESCE(pg_get_function_identity_arguments(proc.oid), '') = ''
        AND pg_get_userbyid(proc.proowner) = current_user
    );
  v_legacy_auth_function_has_dependents boolean := EXISTS (
    SELECT 1
    FROM pg_depend dep
    JOIN pg_proc proc ON proc.oid = dep.refobjid
    JOIN pg_namespace ns ON ns.oid = proc.pronamespace
    WHERE ns.nspname = 'auth'
      AND proc.proname = 'enforce_email_otp_for_mfa'
      AND COALESCE(pg_get_function_identity_arguments(proc.oid), '') = ''
      AND dep.deptype IN ('n', 'a', 'i')
      AND dep.classid <> 'pg_proc'::regclass
  );
BEGIN
  IF NOT v_has_legacy_auth_function THEN
    RETURN;
  END IF;

  IF NOT v_can_drop_legacy_auth_function THEN
    RAISE NOTICE 'Skipping cleanup of auth.enforce_email_otp_for_mfa() (insufficient privileges)';
    RETURN;
  END IF;

  IF v_legacy_auth_function_has_dependents THEN
    RAISE NOTICE 'Skipping cleanup of auth.enforce_email_otp_for_mfa() (still referenced by another object)';
    RETURN;
  END IF;

  EXECUTE 'DROP FUNCTION auth.enforce_email_otp_for_mfa()';
END;
$$;
