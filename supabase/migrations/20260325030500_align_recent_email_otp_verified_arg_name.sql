DROP FUNCTION IF EXISTS public.is_recent_email_otp_verified(uuid);

CREATE FUNCTION public.is_recent_email_otp_verified(
  user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $function$
DECLARE
  verified_at timestamptz;
BEGIN
  SELECT public.user_security.email_otp_verified_at
  INTO verified_at
  FROM public.user_security
  WHERE public.user_security.user_id = is_recent_email_otp_verified.user_id;

  RETURN verified_at IS NOT NULL
    AND verified_at > (NOW() - INTERVAL '1 hour');
END;
$function$;

ALTER FUNCTION public.is_recent_email_otp_verified(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_recent_email_otp_verified(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.is_recent_email_otp_verified(uuid) TO service_role;
