-- ==========================================================================
-- Restrict email OTP verification bookkeeping and enforce service-side function usage
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.record_email_otp_verified(
    "p_user_id" uuid
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_now timestamptz := NOW();
BEGIN
    IF "p_user_id" IS NULL THEN
        RAISE EXCEPTION 'user_id required';
    END IF;

    INSERT INTO "public"."user_security" (user_id, email_otp_verified_at, created_at, updated_at)
    VALUES ("p_user_id", v_now, v_now, v_now)
    ON CONFLICT (user_id) DO UPDATE
    SET email_otp_verified_at = EXCLUDED.email_otp_verified_at,
        updated_at = EXCLUDED.updated_at;

    RETURN v_now;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_email_otp_verified(
    uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_email_otp_verified(
    uuid
) TO postgres;

-- The OTP verification marker must only be written by trusted server-side code
-- after successful OTP validation.
REVOKE EXECUTE ON FUNCTION public.record_email_otp_verified(
    uuid
) FROM public;
REVOKE EXECUTE ON FUNCTION public.record_email_otp_verified(
    uuid
) FROM authenticated;

-- Remove the legacy zero-arg function overload now that callers are migrated.
DROP FUNCTION IF EXISTS public.record_email_otp_verified();
