-- Atomically enforce demo app quota limits and insert the demo app row.
-- This avoids check-then-act race conditions when multiple users create demo apps
-- concurrently in the same organization.
CREATE OR REPLACE FUNCTION public.create_demo_app_with_limits(
  p_owner_org uuid,
  p_user_id uuid,
  p_app_id text,
  p_name text,
  p_icon_url text,
  p_retention bigint,
  p_default_upload_channel text,
  p_last_version text,
  p_active_window_days integer,
  p_user_per_hour integer,
  p_org_per_hour integer,
  p_user_per_24h integer,
  p_org_per_24h integer,
  p_max_active_per_org integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_active_window_start timestamptz := now() - make_interval(days => p_active_window_days);
  v_hour_window_start timestamptz := now() - interval '1 hour';
  v_24h_window_start timestamptz := now() - interval '24 hours';
  v_created_app public.apps;
  v_active_demo_apps bigint;
  v_user_demo_apps_1h bigint;
  v_org_demo_apps_1h bigint;
  v_user_demo_apps_24h bigint;
  v_org_demo_apps_24h bigint;
BEGIN
  IF p_app_id IS NULL OR LEFT(p_app_id, LENGTH('com.capdemo.')) <> 'com.capdemo.' THEN
    RETURN jsonb_build_object(
      'created', false,
      'reason', 'invalid_demo_app_id'
    );
  END IF;

  -- Serialize demo app creation decisions per organization to avoid races.
  PERFORM pg_advisory_xact_lock(hashtext(p_owner_org::text));

  -- Active-demo-app cap (recent demo apps for this org).
  SELECT COUNT(*) INTO v_active_demo_apps
  FROM public.apps
  WHERE owner_org = p_owner_org
    AND app_id LIKE 'com.capdemo.%'
    AND created_at >= v_active_window_start;

  IF v_active_demo_apps >= p_max_active_per_org THEN
    RETURN jsonb_build_object(
      'created', false,
      'reason', 'demo_app_quota_exceeded',
      'count', v_active_demo_apps,
      'limit', p_max_active_per_org
    );
  END IF;

  -- Per-user limit in the last hour.
  SELECT COUNT(*) INTO v_user_demo_apps_1h
  FROM public.apps
  WHERE owner_org = p_owner_org
    AND user_id = p_user_id
    AND app_id LIKE 'com.capdemo.%'
    AND created_at >= v_hour_window_start;

  IF v_user_demo_apps_1h >= p_user_per_hour THEN
    RETURN jsonb_build_object(
      'created', false,
      'reason', 'demo_app_user_rate_limit_exceeded',
      'count', v_user_demo_apps_1h,
      'limit', p_user_per_hour,
      'window_seconds', 3600,
      'retry_after_seconds', 60 * 60
    );
  END IF;

  -- Per-org limit in the last hour.
  SELECT COUNT(*) INTO v_org_demo_apps_1h
  FROM public.apps
  WHERE owner_org = p_owner_org
    AND app_id LIKE 'com.capdemo.%'
    AND created_at >= v_hour_window_start;

  IF v_org_demo_apps_1h >= p_org_per_hour THEN
    RETURN jsonb_build_object(
      'created', false,
      'reason', 'demo_app_org_rate_limit_exceeded',
      'count', v_org_demo_apps_1h,
      'limit', p_org_per_hour,
      'window_seconds', 3600,
      'retry_after_seconds', 60 * 60
    );
  END IF;

  -- Per-user limit in the last 24h.
  SELECT COUNT(*) INTO v_user_demo_apps_24h
  FROM public.apps
  WHERE owner_org = p_owner_org
    AND user_id = p_user_id
    AND app_id LIKE 'com.capdemo.%'
    AND created_at >= v_24h_window_start;

  IF v_user_demo_apps_24h >= p_user_per_24h THEN
    RETURN jsonb_build_object(
      'created', false,
      'reason', 'demo_app_user_rate_limit_exceeded',
      'count', v_user_demo_apps_24h,
      'limit', p_user_per_24h,
      'window_seconds', 86400,
      'retry_after_seconds', 24 * 60 * 60
    );
  END IF;

  -- Per-org limit in the last 24h.
  SELECT COUNT(*) INTO v_org_demo_apps_24h
  FROM public.apps
  WHERE owner_org = p_owner_org
    AND app_id LIKE 'com.capdemo.%'
    AND created_at >= v_24h_window_start;

  IF v_org_demo_apps_24h >= p_org_per_24h THEN
    RETURN jsonb_build_object(
      'created', false,
      'reason', 'demo_app_org_rate_limit_exceeded',
      'count', v_org_demo_apps_24h,
      'limit', p_org_per_24h,
      'window_seconds', 86400,
      'retry_after_seconds', 24 * 60 * 60
    );
  END IF;

  INSERT INTO public.apps (
    owner_org,
    app_id,
    user_id,
    icon_url,
    name,
    retention,
    default_upload_channel,
    last_version
  )
  VALUES (
    p_owner_org,
    p_app_id,
    p_user_id,
    p_icon_url,
    p_name,
    p_retention,
    p_default_upload_channel,
    p_last_version
  )
  RETURNING * INTO v_created_app;

  RETURN jsonb_build_object(
    'created', true,
    'app', to_jsonb(v_created_app)
  );
END
$$;
