-- Fix: add org-scoped auth checks on sensitive plan/usage RPCs and lock down cleanup RPC
-- Add service-role detection by JWT role claim for backend caller contexts.

CREATE OR REPLACE FUNCTION public.get_app_metrics(org_id uuid)
RETURNS TABLE (
    app_id character varying,
    date date,
    mau bigint,
    storage bigint,
    bandwidth bigint,
    build_time_unit bigint,
    get bigint,
    fail bigint,
    install bigint,
    uninstall bigint
) LANGUAGE plpgsql
SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  cycle_start timestamptz;
  cycle_end timestamptz;
  request_role text;
BEGIN
  request_role := NULLIF(current_setting('request.jwt.claim.role', true), '');

  IF request_role IS NULL THEN
    RETURN;
  END IF;

  IF request_role <> 'service_role' THEN
    IF NOT public.check_min_rights(
        'read'::public.user_min_right,
        public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], get_app_metrics.org_id),
        get_app_metrics.org_id,
        NULL::character varying,
        NULL::bigint
    ) THEN
      RETURN;
    END IF;
  END IF;

  SELECT subscription_anchor_start, subscription_anchor_end
  INTO cycle_start, cycle_end
  FROM public.get_cycle_info_org(org_id);

  RETURN QUERY SELECT * FROM public.get_app_metrics(org_id, cycle_start::date, (cycle_end::date - 1));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_app_metrics(
    org_id uuid,
    start_date date,
    end_date date
) RETURNS TABLE (
    app_id character varying,
    date date,
    mau bigint,
    storage bigint,
    bandwidth bigint,
    build_time_unit bigint,
    get bigint,
    fail bigint,
    install bigint,
    uninstall bigint
) LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  cache_entry public.app_metrics_cache%ROWTYPE;
  org_exists boolean;
  request_role text;
BEGIN
  request_role := NULLIF(current_setting('request.jwt.claim.role', true), '');

  IF request_role IS NULL THEN
    RETURN;
  END IF;

  IF request_role <> 'service_role' THEN
    IF NOT public.check_min_rights(
        'read'::public.user_min_right,
        public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], get_app_metrics.org_id),
        get_app_metrics.org_id,
        NULL::character varying,
        NULL::bigint
    ) THEN
      RETURN;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.orgs
    WHERE id = get_app_metrics.org_id
  ) INTO org_exists;

  IF NOT org_exists THEN
    RETURN;
  END IF;

  SELECT *
  INTO cache_entry
  FROM public.app_metrics_cache
  WHERE public.app_metrics_cache.org_id = get_app_metrics.org_id;

  IF cache_entry.id IS NULL
    OR cache_entry.start_date IS DISTINCT FROM get_app_metrics.start_date
    OR cache_entry.end_date IS DISTINCT FROM get_app_metrics.end_date
    OR cache_entry.cached_at IS NULL
    OR cache_entry.cached_at < (NOW() - interval '5 minutes')
  THEN
    cache_entry := public.seed_get_app_metrics_caches(get_app_metrics.org_id, get_app_metrics.start_date, get_app_metrics.end_date);
  END IF;

  IF cache_entry.response IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    metrics.app_id,
    metrics.date,
    metrics.mau,
    metrics.storage,
    metrics.bandwidth,
    metrics.build_time_unit,
    metrics.get,
    metrics.fail,
    metrics.install,
    metrics.uninstall
  FROM jsonb_to_recordset(cache_entry.response) AS metrics(
    app_id character varying,
    date date,
    mau bigint,
    storage bigint,
    bandwidth bigint,
    build_time_unit bigint,
    get bigint,
    fail bigint,
    install bigint,
    uninstall bigint
  )
  ORDER BY metrics.app_id, metrics.date;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_global_metrics(org_id uuid)
RETURNS TABLE (
  date date,
  mau bigint,
  storage bigint,
  bandwidth bigint,
  get bigint,
  fail bigint,
  install bigint,
  uninstall bigint
) LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  cycle_start timestamptz;
  cycle_end timestamptz;
  request_role text;
BEGIN
  request_role := NULLIF(current_setting('request.jwt.claim.role', true), '');

  IF request_role IS NULL THEN
    RETURN;
  END IF;

  IF request_role <> 'service_role' THEN
    IF NOT public.check_min_rights(
        'read'::public.user_min_right,
        public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], get_global_metrics.org_id),
        get_global_metrics.org_id,
        NULL::character varying,
        NULL::bigint
    ) THEN
      RETURN;
    END IF;
  END IF;

  SELECT subscription_anchor_start, subscription_anchor_end
  INTO cycle_start, cycle_end
  FROM public.get_cycle_info_org(org_id);

  RETURN QUERY
  SELECT * FROM public.get_global_metrics(org_id, cycle_start::date, (cycle_end::date - 1));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_global_metrics(
  org_id uuid,
  start_date date,
  end_date date
) RETURNS TABLE (
  date date,
  mau bigint,
  storage bigint,
  bandwidth bigint,
  get bigint,
  fail bigint,
  install bigint,
  uninstall bigint
) LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  request_role text;
BEGIN
  request_role := NULLIF(current_setting('request.jwt.claim.role', true), '');

  IF request_role IS NULL THEN
    RETURN;
  END IF;

  IF request_role <> 'service_role' THEN
    IF NOT public.check_min_rights(
        'read'::public.user_min_right,
        public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], get_global_metrics.org_id),
        get_global_metrics.org_id,
        NULL::character varying,
        NULL::bigint
    ) THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    metrics.date,
    SUM(metrics.mau)::bigint AS mau,
    SUM(metrics.storage)::bigint AS storage,
    SUM(metrics.bandwidth)::bigint AS bandwidth,
    SUM(metrics.get)::bigint AS get,
    SUM(metrics.fail)::bigint AS fail,
    SUM(metrics.install)::bigint AS install,
    SUM(metrics.uninstall)::bigint AS uninstall
  FROM
    public.get_app_metrics(org_id, start_date, end_date) AS metrics
  GROUP BY
    metrics.date
  ORDER BY
    metrics.date;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_plan_max_org(orgid uuid)
RETURNS TABLE (
    mau bigint,
    bandwidth bigint,
    storage bigint,
    build_time_unit bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_is_service_role boolean;
  v_request_role text;
BEGIN
  v_request_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
  v_is_service_role := (
    (v_request_role = 'service_role')
    OR ((SELECT auth.jwt() ->> 'role') = 'service_role')
    OR ((SELECT auth.role()) = 'service_role')
    OR ((SELECT session_user) IS NOT DISTINCT FROM 'postgres')
  );

  IF NOT v_is_service_role AND NOT public.check_min_rights(
      'read'::public.user_min_right,
      public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], get_current_plan_max_org.orgid),
      get_current_plan_max_org.orgid,
      NULL::character varying,
      NULL::bigint
  ) THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  RETURN QUERY
  SELECT p.mau, p.bandwidth, p.storage, p.build_time_unit
  FROM public.orgs o
  JOIN public.stripe_info si ON o.customer_id = si.customer_id
  JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_plan_name_org(orgid uuid)
RETURNS character varying
LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  v_is_service_role boolean;
  v_request_role text;
BEGIN
  v_request_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
  v_is_service_role := (
    (v_request_role = 'service_role')
    OR ((SELECT auth.jwt() ->> 'role') = 'service_role')
    OR ((SELECT auth.role()) = 'service_role')
    OR ((SELECT session_user) IS NOT DISTINCT FROM 'postgres')
  );

  IF NOT v_is_service_role AND NOT public.check_min_rights(
      'read'::public.user_min_right,
      public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], get_current_plan_name_org.orgid),
      get_current_plan_name_org.orgid,
      NULL::character varying,
      NULL::bigint
  ) THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  RETURN
  (SELECT name
  FROM public.plans
    WHERE stripe_id=(SELECT product_id
    FROM public.stripe_info
    WHERE customer_id=(SELECT customer_id FROM public.orgs WHERE id=orgid)
    ));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cycle_info_org(orgid uuid)
RETURNS TABLE (
  subscription_anchor_start timestamp with time zone,
  subscription_anchor_end timestamp with time zone
) LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  customer_id_var text;
  stripe_info_row public.stripe_info%ROWTYPE;
  anchor_day INTERVAL;
  start_date timestamp with time zone;
  end_date timestamp with time zone;
  v_is_service_role boolean;
  v_request_role text;
BEGIN
  v_request_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
  v_is_service_role := (
    (v_request_role = 'service_role')
    OR ((SELECT auth.jwt() ->> 'role') = 'service_role')
    OR ((SELECT auth.role()) = 'service_role')
    OR ((SELECT session_user) IS NOT DISTINCT FROM 'postgres')
  );

  IF NOT v_is_service_role AND NOT public.check_min_rights(
      'read'::public.user_min_right,
      public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], get_cycle_info_org.orgid),
      get_cycle_info_org.orgid,
      NULL::character varying,
      NULL::bigint
  ) THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  SELECT customer_id INTO customer_id_var FROM public.orgs WHERE id = orgid;

  SELECT * INTO stripe_info_row FROM public.stripe_info WHERE customer_id = customer_id_var;

  anchor_day := COALESCE(stripe_info_row.subscription_anchor_start - date_trunc('MONTH', stripe_info_row.subscription_anchor_start), '0 DAYS'::INTERVAL);

  IF anchor_day > NOW() - date_trunc('MONTH', NOW()) THEN
    start_date := date_trunc('MONTH', NOW() - INTERVAL '1 MONTH') + anchor_day;
  ELSE
    start_date := date_trunc('MONTH', NOW()) + anchor_day;
  END IF;

  end_date := start_date + INTERVAL '1 MONTH';

  RETURN QUERY
  SELECT start_date, end_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_plan_usage_percent_detailed(orgid uuid)
RETURNS TABLE (
  total_percent double precision,
  mau_percent double precision,
  bandwidth_percent double precision,
  storage_percent double precision,
  build_time_percent double precision
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_start_date date;
  v_end_date date;
  v_plan_mau bigint;
  v_plan_bandwidth bigint;
  v_plan_storage bigint;
  v_plan_build_time bigint;
  v_anchor_day INTERVAL;
  total_stats RECORD;
  percent_mau double precision;
  percent_bandwidth double precision;
  percent_storage double precision;
  percent_build_time double precision;
  v_is_service_role boolean;
  v_request_role text;
BEGIN
  v_request_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
  v_is_service_role := (
    (v_request_role = 'service_role')
    OR ((SELECT auth.jwt() ->> 'role') = 'service_role')
    OR ((SELECT auth.role()) = 'service_role')
    OR ((SELECT session_user) IS NOT DISTINCT FROM 'postgres')
  );

  IF NOT v_is_service_role AND NOT public.check_min_rights(
      'read'::public.user_min_right,
      public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], get_plan_usage_percent_detailed.orgid),
      get_plan_usage_percent_detailed.orgid,
      NULL::character varying,
      NULL::bigint
  ) THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  SELECT
    COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL),
    p.mau,
    p.bandwidth,
    p.storage,
    p.build_time_unit
  INTO v_anchor_day, v_plan_mau, v_plan_bandwidth, v_plan_storage, v_plan_build_time
  FROM public.orgs o
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  LEFT JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid;

  IF v_anchor_day > NOW() - date_trunc('MONTH', NOW()) THEN
    v_start_date := (date_trunc('MONTH', NOW() - INTERVAL '1 MONTH') + v_anchor_day)::date;
  ELSE
    v_start_date := (date_trunc('MONTH', NOW()) + v_anchor_day)::date;
  END IF;
  v_end_date := (v_start_date + INTERVAL '1 MONTH')::date;

  SELECT * INTO total_stats
  FROM public.get_total_metrics(orgid, v_start_date, v_end_date);

  percent_mau := public.convert_number_to_percent(total_stats.mau, v_plan_mau);
  percent_bandwidth := public.convert_number_to_percent(total_stats.bandwidth, v_plan_bandwidth);
  percent_storage := public.convert_number_to_percent(total_stats.storage, v_plan_storage);
  percent_build_time := public.convert_number_to_percent(total_stats.build_time_unit, v_plan_build_time);

  RETURN QUERY SELECT
    GREATEST(percent_mau, percent_bandwidth, percent_storage, percent_build_time),
    percent_mau,
    percent_bandwidth,
    percent_storage,
    percent_build_time;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_plan_usage_percent_detailed(
    orgid uuid,
    cycle_start date,
    cycle_end date
) RETURNS TABLE (
    total_percent double precision,
    mau_percent double precision,
    bandwidth_percent double precision,
    storage_percent double precision,
    build_time_percent double precision
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_plan_mau bigint;
  v_plan_bandwidth bigint;
  v_plan_storage bigint;
  v_plan_build_time bigint;
  total_stats RECORD;
  percent_mau double precision;
  percent_bandwidth double precision;
  percent_storage double precision;
  percent_build_time double precision;
  v_is_service_role boolean;
  v_request_role text;
BEGIN
  v_request_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
  v_is_service_role := (
    (v_request_role = 'service_role')
    OR ((SELECT auth.jwt() ->> 'role') = 'service_role')
    OR ((SELECT auth.role()) = 'service_role')
    OR ((SELECT session_user) IS NOT DISTINCT FROM 'postgres')
  );

  IF NOT v_is_service_role AND NOT public.check_min_rights(
      'read'::public.user_min_right,
      public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], get_plan_usage_percent_detailed.orgid),
      get_plan_usage_percent_detailed.orgid,
      NULL::character varying,
      NULL::bigint
  ) THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  SELECT p.mau, p.bandwidth, p.storage, p.build_time_unit
  INTO v_plan_mau, v_plan_bandwidth, v_plan_storage, v_plan_build_time
  FROM public.orgs o
  JOIN public.stripe_info si ON o.customer_id = si.customer_id
  JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid;

  SELECT * INTO total_stats
  FROM public.get_total_metrics(orgid, cycle_start, cycle_end);

  percent_mau := public.convert_number_to_percent(total_stats.mau, v_plan_mau);
  percent_bandwidth := public.convert_number_to_percent(total_stats.bandwidth, v_plan_bandwidth);
  percent_storage := public.convert_number_to_percent(total_stats.storage, v_plan_storage);
  percent_build_time := public.convert_number_to_percent(total_stats.build_time_unit, v_plan_build_time);

  RETURN QUERY SELECT
    GREATEST(percent_mau, percent_bandwidth, percent_storage, percent_build_time),
    percent_mau,
    percent_bandwidth,
    percent_storage,
    percent_build_time;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_old_deleted_versions() FROM public;
REVOKE EXECUTE ON FUNCTION public.delete_old_deleted_versions() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_old_deleted_versions() TO service_role;
