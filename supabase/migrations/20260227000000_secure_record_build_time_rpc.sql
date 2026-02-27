-- Revoke public execution of record_build_time and enforce identity checks.
-- Keep the existing parameter signature for backward compatibility.

REVOKE ALL ON FUNCTION public.record_build_time(
  uuid,
  uuid,
  character varying,
  character varying,
  bigint
) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_build_time(
  uuid,
  uuid,
  character varying,
  character varying,
  bigint
) TO service_role;

CREATE OR REPLACE FUNCTION public.record_build_time(
    p_org_id uuid,
    p_user_id uuid,
    p_build_id character varying,
    p_platform character varying,
    p_build_time_unit bigint
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET
search_path = '' AS $$
DECLARE
  v_build_log_id uuid;
  v_multiplier numeric;
  v_billable_seconds bigint;
  v_caller_user_id uuid;
BEGIN
  v_caller_user_id := public.get_identity_org_allowed(
    '{read,upload,write,all}'::public.key_mode[],
    p_org_id
  );

  IF v_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  IF NOT public.check_min_rights(
    'write'::public.user_min_right,
    v_caller_user_id,
    p_org_id,
    NULL::character varying,
    NULL::bigint
  ) THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  IF p_build_time_unit < 0 THEN
    RAISE EXCEPTION 'Build time cannot be negative';
  END IF;
  IF p_platform NOT IN ('ios', 'android') THEN
    RAISE EXCEPTION 'Invalid platform: %', p_platform;
  END IF;

  -- Apply platform multiplier
  v_multiplier := CASE p_platform
    WHEN 'ios' THEN 2
    WHEN 'android' THEN 1
    ELSE 1
  END;

  v_billable_seconds := (p_build_time_unit * v_multiplier)::bigint;

  INSERT INTO public.build_logs (org_id, user_id, build_id, platform, build_time_unit, billable_seconds)
  VALUES (p_org_id, v_caller_user_id, p_build_id, p_platform, p_build_time_unit, v_billable_seconds)
  ON CONFLICT (build_id, org_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    platform = EXCLUDED.platform,
    build_time_unit = EXCLUDED.build_time_unit,
    billable_seconds = EXCLUDED.billable_seconds
  RETURNING id INTO v_build_log_id;

  RETURN v_build_log_id;
END;
$$;
