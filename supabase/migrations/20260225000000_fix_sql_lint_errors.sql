-- Fix SQL lint errors:
-- 1. record_email_otp_verified: rename param user_id -> p_user_id to avoid ambiguity with column name
-- 2. get_total_metrics(): fix uuid comparison with empty string

-- 1. Fix ambiguous user_id parameter in record_email_otp_verified
CREATE OR REPLACE FUNCTION "public"."record_email_otp_verified"("p_user_id" uuid)
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

-- 2. Fix get_total_metrics(): current_setting returns text, must handle before casting to uuid
CREATE OR REPLACE FUNCTION public.get_total_metrics() RETURNS TABLE (
  mau bigint,
  storage bigint,
  bandwidth bigint,
  build_time_unit bigint,
  get bigint,
  fail bigint,
  install bigint,
  uninstall bigint
) LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_request_user uuid;
  v_request_org_id uuid;
  v_org_id_text text;
BEGIN
  SELECT public.get_identity() INTO v_request_user;

  IF v_request_user IS NULL THEN
    RETURN;
  END IF;

  SELECT current_setting('request.jwt.claim.org_id', true) INTO v_org_id_text;

  IF v_org_id_text IS NOT NULL AND v_org_id_text <> '' THEN
    v_request_org_id := v_org_id_text::uuid;
  END IF;

  IF v_request_org_id IS NULL THEN
    SELECT org_users.org_id
    INTO v_request_org_id
    FROM public.org_users
    WHERE org_users.user_id = v_request_user
    ORDER BY org_users.org_id
    LIMIT 1;
  END IF;

  IF v_request_org_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.org_users
    WHERE org_users.org_id = v_request_org_id
      AND org_users.user_id = v_request_user
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    metrics.mau,
    metrics.storage,
    metrics.bandwidth,
    metrics.build_time_unit,
    metrics.get,
    metrics.fail,
    metrics.install,
    metrics.uninstall
  FROM public.get_total_metrics(v_request_org_id) AS metrics;
END;
$function$;
