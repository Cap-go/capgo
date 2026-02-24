-- ==========================================================================
-- Restrict email OTP verification bookkeeping RPC to service role
-- ==========================================================================

-- The OTP verification marker must only be written by trusted server-side code
-- after successful OTP validation.
REVOKE EXECUTE ON FUNCTION "public"."record_email_otp_verified"() FROM "authenticated";

