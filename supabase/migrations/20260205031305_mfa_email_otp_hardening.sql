-- ==========================================================================
-- Harden email OTP verification record to require OTP-authenticated session
-- ==========================================================================

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

    IF NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(coalesce((SELECT auth.jwt())->'amr', '[]'::jsonb)) AS amr_elem
        WHERE amr_elem->>'method' = 'otp'
    ) THEN
        RAISE EXCEPTION 'otp authentication required';
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
