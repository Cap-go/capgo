-- ============================================================================
-- Email OTP verification guard for MFA enrollment (unsupported supabase hack)
-- ============================================================================

-- ============================================================================
-- Section 1: User security table for OTP verification tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS "public"."user_security" (
    "user_id" uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    "email_otp_verified_at" timestamptz NULL,
    "created_at" timestamptz NOT NULL DEFAULT NOW(),
    "updated_at" timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE "public"."user_security" IS
  'Tracks security-related user metadata like email OTP verification for MFA gating';
COMMENT ON COLUMN "public"."user_security"."email_otp_verified_at" IS
  'Timestamp of last successful email OTP verification for MFA enrollment';

ALTER TABLE "public"."user_security" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own security status"
ON "public"."user_security"
FOR SELECT
TO authenticated
USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own security status"
ON "public"."user_security"
FOR INSERT
TO authenticated
WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own security status"
ON "public"."user_security"
FOR UPDATE
TO authenticated
USING (user_id = (select auth.uid()))
WITH CHECK (user_id = (select auth.uid()));

GRANT SELECT, INSERT, UPDATE ON "public"."user_security" TO "authenticated";
GRANT ALL ON "public"."user_security" TO "service_role";
GRANT ALL ON "public"."user_security" TO "postgres";

-- ============================================================================
-- Section 2: Helper function to check OTP verification freshness
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."is_recent_email_otp_verified"("user_id" uuid) RETURNS boolean
LANGUAGE "plpgsql" STABLE
SET "search_path" TO ''
AS $$
DECLARE
    verified_at timestamptz;
BEGIN
    SELECT public.user_security.email_otp_verified_at
    INTO verified_at
    FROM public.user_security
    WHERE public.user_security.user_id = is_recent_email_otp_verified.user_id;

    RETURN verified_at IS NOT NULL AND verified_at > (NOW() - interval '1 hour');
END;
$$;

ALTER FUNCTION "public"."is_recent_email_otp_verified"(uuid) OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."is_recent_email_otp_verified"(uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."is_recent_email_otp_verified"(uuid) TO "service_role";

-- ============================================================================
-- Section 3: Trigger to block MFA enrollment without recent OTP verification
-- ============================================================================

CREATE OR REPLACE FUNCTION "auth"."enforce_email_otp_for_mfa"() RETURNS trigger
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
    otp_ok boolean;
BEGIN
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

ALTER FUNCTION "auth"."enforce_email_otp_for_mfa"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "trg_enforce_email_otp_for_mfa" ON auth.mfa_factors;
CREATE TRIGGER "trg_enforce_email_otp_for_mfa"
BEFORE INSERT OR UPDATE ON auth.mfa_factors
FOR EACH ROW
EXECUTE FUNCTION auth.enforce_email_otp_for_mfa();
