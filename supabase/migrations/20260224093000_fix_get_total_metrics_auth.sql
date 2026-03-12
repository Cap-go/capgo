-- Harden get_total_metrics RPC access:
-- - provide admin-only UUID overloads for explicit org lookup
-- - provide authenticated user overload without UUID that resolves org from caller context

DROP FUNCTION IF EXISTS public.get_total_metrics();

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
BEGIN
  IF start_date IS NULL OR end_date IS NULL THEN
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
    cache_entry := public.seed_org_metrics_cache(get_total_metrics.org_id, start_date, end_date);

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

  cache_entry := public.seed_org_metrics_cache(get_total_metrics.org_id, start_date, end_date);

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
GRANT ALL ON FUNCTION public.get_total_metrics(
    uuid, date, date
) TO service_role;

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
BEGIN
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
REVOKE ALL ON FUNCTION public.get_total_metrics(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_total_metrics(uuid) FROM public;
GRANT ALL ON FUNCTION public.get_total_metrics(uuid) TO service_role;

CREATE FUNCTION public.get_total_metrics() RETURNS TABLE (
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
    BEGIN
      v_request_org_id := v_org_id_text::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      -- Malformed org_id in JWT; fall through to org_users lookup
      v_request_org_id := NULL;
    END;
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

ALTER FUNCTION public.get_total_metrics() OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.get_total_metrics() FROM anon;
REVOKE ALL ON FUNCTION public.get_total_metrics() FROM public;
GRANT ALL ON FUNCTION public.get_total_metrics() TO authenticated;
