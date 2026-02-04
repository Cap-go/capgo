-- ============================================================================
-- Email OTP verification guard for MFA enrollment (unsupported supabase hack)
-- ============================================================================

-- ============================================================================
-- Section 1: Security settings (compatibility cutoff)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "public"."security_settings" (
    "id" boolean PRIMARY KEY DEFAULT true,
    "mfa_email_otp_enforced_at" timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE "public"."security_settings" IS
  'Singleton settings table for security feature cutovers';

INSERT INTO "public"."security_settings" ("id", "mfa_email_otp_enforced_at")
VALUES (true, NOW())
ON CONFLICT ("id") DO NOTHING;

-- ============================================================================
-- Section 2: User security table for OTP verification tracking
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

GRANT SELECT ON "public"."user_security" TO "authenticated";
GRANT ALL ON "public"."user_security" TO "service_role";
GRANT ALL ON "public"."user_security" TO "postgres";

-- ============================================================================
-- Section 3: Record OTP verification (server-side timestamp)
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."record_email_otp_verified"() RETURNS timestamptz
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
    v_user_id uuid;
    v_now timestamptz;
BEGIN
    SELECT auth.uid() INTO v_user_id;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'authentication required';
    END IF;

    v_now := NOW();

    INSERT INTO public.user_security (user_id, email_otp_verified_at, created_at, updated_at)
    VALUES (v_user_id, v_now, v_now, v_now)
    ON CONFLICT (user_id) DO UPDATE
    SET email_otp_verified_at = EXCLUDED.email_otp_verified_at,
        updated_at = EXCLUDED.updated_at;

    RETURN v_now;
END;
$$;

ALTER FUNCTION "public"."record_email_otp_verified"() OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."record_email_otp_verified"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."record_email_otp_verified"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."record_email_otp_verified"() TO "authenticated";

-- ============================================================================
-- Section 4: Helper function to check OTP verification freshness
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
-- Section 5: Trigger to block MFA enrollment without recent OTP verification
-- ============================================================================

DO $$
BEGIN
    BEGIN
        EXECUTE $authfn$
        CREATE OR REPLACE FUNCTION "auth"."enforce_email_otp_for_mfa"() RETURNS trigger
        LANGUAGE "plpgsql" SECURITY DEFINER
        SET "search_path" TO ''
        AS $body$
        DECLARE
            otp_ok boolean;
            enforced_at timestamptz;
            user_created_at timestamptz;
        BEGIN
            SELECT public.security_settings.mfa_email_otp_enforced_at
            INTO enforced_at
            FROM public.security_settings
            WHERE public.security_settings.id = true;

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
        $authfn$;

        EXECUTE 'ALTER FUNCTION "auth"."enforce_email_otp_for_mfa"() OWNER TO "postgres"';
        EXECUTE 'DROP TRIGGER IF EXISTS "trg_enforce_email_otp_for_mfa" ON auth.mfa_factors';
        EXECUTE 'CREATE TRIGGER "trg_enforce_email_otp_for_mfa" BEFORE INSERT OR UPDATE ON auth.mfa_factors FOR EACH ROW EXECUTE FUNCTION auth.enforce_email_otp_for_mfa()';
    EXCEPTION
        WHEN insufficient_privilege THEN
            RAISE NOTICE 'Skipping auth.mfa_factors trigger setup (insufficient privileges)';
    END;
END $$;
