-- Harden get_total_metrics RPC access:
-- - block anonymous callers entirely
-- - require authenticated org membership for user callers
-- - retain service role/internal access without a JWT-backed user identity

DROP FUNCTION IF EXISTS public.get_total_metrics(uuid, date, date);
DROP FUNCTION IF EXISTS public.get_total_metrics(uuid);

CREATE FUNCTION public.get_total_metrics(
  org_id uuid,
  start_date date,
  end_date date
) RETURNS TABLE (
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
  cache_entry public.org_metrics_cache%ROWTYPE;
  cache_ttl interval := '5 minutes'::interval;
  v_request_user uuid;
  v_request_role text;
BEGIN
  IF start_date IS NULL OR end_date IS NULL THEN
    RETURN;
  END IF;

  v_request_user := (SELECT auth.uid());
  SELECT auth.role() INTO v_request_role;
  IF v_request_role IS NULL OR v_request_role = '' THEN
    SELECT current_setting('request.jwt.claim.role', true) INTO v_request_role;
  END IF;

  IF v_request_user IS NULL THEN
    IF v_request_role IS DISTINCT FROM 'service_role' AND session_user NOT IN ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin', 'supabase_realtime_admin') THEN
      RETURN;
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.org_users ou
    WHERE ou.org_id = get_total_metrics.org_id
      AND ou.user_id = v_request_user
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.orgs
    WHERE orgs.id = get_total_metrics.org_id
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_stat_xact_user_tables
    WHERE relname IN (
      'apps',
      'deleted_apps',
      'daily_mau',
      'daily_bandwidth',
      'daily_build_time',
      'daily_version',
      'app_versions',
      'app_versions_meta'
    )
    AND (n_tup_ins > 0 OR n_tup_upd > 0 OR n_tup_del > 0)
  ) THEN
    cache_entry := public.seed_org_metrics_cache(org_id, start_date, end_date);

    RETURN QUERY SELECT
      cache_entry.mau,
      cache_entry.storage,
      cache_entry.bandwidth,
      cache_entry.build_time_unit,
      cache_entry.get,
      cache_entry.fail,
      cache_entry.install,
      cache_entry.uninstall;
    RETURN;
  END IF;

  SELECT * INTO cache_entry
  FROM public.org_metrics_cache
  WHERE org_metrics_cache.org_id = get_total_metrics.org_id;

  IF FOUND
    AND cache_entry.start_date = start_date
    AND cache_entry.end_date = end_date
    AND cache_entry.cached_at > clock_timestamp() - cache_ttl
  THEN
    RETURN QUERY SELECT
      cache_entry.mau,
      cache_entry.storage,
      cache_entry.bandwidth,
      cache_entry.build_time_unit,
      cache_entry.get,
      cache_entry.fail,
      cache_entry.install,
      cache_entry.uninstall;
    RETURN;
  END IF;

  cache_entry := public.seed_org_metrics_cache(org_id, start_date, end_date);

  RETURN QUERY SELECT
    cache_entry.mau,
    cache_entry.storage,
    cache_entry.bandwidth,
    cache_entry.build_time_unit,
    cache_entry.get,
    cache_entry.fail,
    cache_entry.install,
    cache_entry.uninstall;
END;
$function$;

ALTER FUNCTION public.get_total_metrics(uuid, date, date) OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.get_total_metrics(uuid, date, date) FROM anon;
REVOKE ALL ON FUNCTION public.get_total_metrics(uuid, date, date) FROM public;
GRANT ALL ON FUNCTION public.get_total_metrics(uuid, date, date) TO authenticated;
GRANT ALL ON FUNCTION public.get_total_metrics(uuid, date, date) TO service_role;

CREATE FUNCTION public.get_total_metrics(org_id uuid) RETURNS TABLE (
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
  v_start_date date;
  v_end_date date;
  v_anchor_day interval;
  v_request_user uuid;
  v_request_role text;
BEGIN
  v_request_user := (SELECT auth.uid());
  SELECT auth.role() INTO v_request_role;
  IF v_request_role IS NULL OR v_request_role = '' THEN
    SELECT current_setting('request.jwt.claim.role', true) INTO v_request_role;
  END IF;

  IF v_request_user IS NULL THEN
    IF v_request_role IS DISTINCT FROM 'service_role' AND session_user NOT IN ('postgres', 'service_role', 'supabase_auth_admin', 'supabase_realtime_admin', 'supabase_storage_admin', 'supabase_admin') THEN
      RETURN;
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.org_users ou
    WHERE ou.org_id = get_total_metrics.org_id
      AND ou.user_id = v_request_user
  ) THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
  INTO v_anchor_day
  FROM public.orgs o
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  WHERE o.id = get_total_metrics.org_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_anchor_day > NOW() - date_trunc('MONTH', NOW()) THEN
    v_start_date := (date_trunc('MONTH', NOW() - INTERVAL '1 MONTH') + v_anchor_day)::date;
  ELSE
    v_start_date := (date_trunc('MONTH', NOW()) + v_anchor_day)::date;
  END IF;
  v_end_date := (v_start_date + INTERVAL '1 MONTH')::date;

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
  FROM public.get_total_metrics(org_id, v_start_date, v_end_date) AS metrics;
END;
$function$;

ALTER FUNCTION public.get_total_metrics(uuid) OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.get_total_metrics(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_total_metrics(uuid) FROM public;
GRANT ALL ON FUNCTION public.get_total_metrics(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_total_metrics(uuid) TO service_role;
