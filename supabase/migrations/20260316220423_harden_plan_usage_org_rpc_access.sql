-- Harden plan/billing org RPCs against cross-tenant and anonymous access.
-- Security fix for GHSA-wh77-4qcm-f8j6.

CREATE OR REPLACE FUNCTION public.get_current_plan_name_org(orgid uuid)
RETURNS character varying
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_user uuid;
  v_is_service_role boolean;
BEGIN
  v_is_service_role := (
    ((SELECT auth.jwt() ->> 'role') = 'service_role')
    OR ((SELECT session_user) IS NOT DISTINCT FROM 'postgres')
  );

  IF NOT v_is_service_role THEN
    v_request_user := public.get_identity_org_allowed(
      '{read,upload,write,all}'::public.key_mode[],
      get_current_plan_name_org.orgid
    );

    IF v_request_user IS NULL OR NOT public.check_min_rights(
      'read'::public.user_min_right,
      v_request_user,
      get_current_plan_name_org.orgid,
      NULL::varchar,
      NULL::bigint
    ) THEN
      RAISE EXCEPTION 'NO_RIGHTS';
    END IF;
  END IF;

  RETURN (
    SELECT p.name
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    JOIN public.plans p ON si.product_id = p.stripe_id
    WHERE o.id = orgid
    LIMIT 1
  );
END;
$$;

ALTER FUNCTION public.get_current_plan_name_org(uuid) OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.get_current_plan_name_org(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_current_plan_name_org(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_current_plan_name_org(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_current_plan_name_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_plan_name_org(uuid) TO service_role;
COMMENT ON FUNCTION public.get_current_plan_name_org(uuid) IS
  'Return the Stripe plan name for the supplied organization after enforcing read-level access; returns NULL when the org is missing or the caller is unauthorized.';

CREATE OR REPLACE FUNCTION public.get_cycle_info_org(orgid uuid)
RETURNS TABLE (
  subscription_anchor_start timestamptz,
  subscription_anchor_end timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  customer_id_var text;
  stripe_info_row public.stripe_info%ROWTYPE;
  anchor_day interval;
  start_date timestamptz;
  end_date timestamptz;
  v_request_user uuid;
  v_is_service_role boolean;
BEGIN
  v_is_service_role := (
    ((SELECT auth.jwt() ->> 'role') = 'service_role')
    OR ((SELECT session_user) IS NOT DISTINCT FROM 'postgres')
  );

  IF NOT v_is_service_role THEN
    v_request_user := public.get_identity_org_allowed(
      '{read,upload,write,all}'::public.key_mode[],
      get_cycle_info_org.orgid
    );

    IF v_request_user IS NULL OR NOT public.check_min_rights(
      'read'::public.user_min_right,
      v_request_user,
      get_cycle_info_org.orgid,
      NULL::varchar,
      NULL::bigint
    ) THEN
      RAISE EXCEPTION 'NO_RIGHTS';
    END IF;
  END IF;

  SELECT customer_id
  INTO customer_id_var
  FROM public.orgs
  WHERE id = orgid;

  SELECT *
  INTO stripe_info_row
  FROM public.stripe_info
  WHERE customer_id = customer_id_var;

  anchor_day := COALESCE(
    stripe_info_row.subscription_anchor_start - date_trunc('MONTH', stripe_info_row.subscription_anchor_start),
    '0 DAYS'::interval
  );

  IF anchor_day > now() - date_trunc('MONTH', now()) THEN
    start_date := date_trunc('MONTH', now() - interval '1 MONTH') + anchor_day;
  ELSE
    start_date := date_trunc('MONTH', now()) + anchor_day;
  END IF;

  end_date := start_date + interval '1 MONTH';

  RETURN QUERY
  SELECT start_date, end_date;
END;
$$;

ALTER FUNCTION public.get_cycle_info_org(uuid) OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.get_cycle_info_org(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_cycle_info_org(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_cycle_info_org(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_cycle_info_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cycle_info_org(uuid) TO service_role;
COMMENT ON FUNCTION public.get_cycle_info_org(uuid) IS
  'Return the billing cycle start and end for the supplied organization after verifying read access, using Stripe anchor dates to compute the boundaries.';

CREATE OR REPLACE FUNCTION public.get_plan_usage_percent_detailed(orgid uuid)
RETURNS TABLE (
  total_percent double precision,
  mau_percent double precision,
  bandwidth_percent double precision,
  storage_percent double precision,
  build_time_percent double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start_date date;
  v_end_date date;
  v_plan_mau bigint;
  v_plan_bandwidth bigint;
  v_plan_storage bigint;
  v_plan_build_time bigint;
  v_anchor_day interval;
  total_stats record;
  percent_mau double precision;
  percent_bandwidth double precision;
  percent_storage double precision;
  percent_build_time double precision;
  v_request_user uuid;
  v_is_service_role boolean;
  v_tx_read_only boolean := current_setting('transaction_read_only') = 'on';
BEGIN
  v_is_service_role := (
    ((SELECT auth.jwt() ->> 'role') = 'service_role')
    OR ((SELECT session_user) IS NOT DISTINCT FROM 'postgres')
  );

  IF NOT v_is_service_role THEN
    v_request_user := public.get_identity_org_allowed(
      '{read,upload,write,all}'::public.key_mode[],
      get_plan_usage_percent_detailed.orgid
    );

    IF v_request_user IS NULL OR NOT public.check_min_rights(
      'read'::public.user_min_right,
      v_request_user,
      get_plan_usage_percent_detailed.orgid,
      NULL::varchar,
      NULL::bigint
    ) THEN
      RAISE EXCEPTION 'NO_RIGHTS';
    END IF;

    v_tx_read_only := TRUE;
  END IF;

  SELECT
    COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::interval),
    p.mau,
    p.bandwidth,
    p.storage,
    p.build_time_unit
  INTO v_anchor_day, v_plan_mau, v_plan_bandwidth, v_plan_storage, v_plan_build_time
  FROM public.orgs o
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  LEFT JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid;

  IF v_anchor_day > now() - date_trunc('MONTH', now()) THEN
    v_start_date := (date_trunc('MONTH', now() - interval '1 MONTH') + v_anchor_day)::date;
  ELSE
    v_start_date := (date_trunc('MONTH', now()) + v_anchor_day)::date;
  END IF;
  v_end_date := (v_start_date + interval '1 MONTH')::date;

  IF v_tx_read_only THEN
    -- User-facing RPCs must stay read-only so they work from the hardened
    -- read-only test harness and replica paths. Internal cache refreshes still
    -- happen through get_total_metrics()/get_plan_usage_and_fit().
    SELECT *
    INTO total_stats
    FROM public.calculate_org_metrics_cache_entry(orgid, v_start_date, v_end_date);
  ELSE
    SELECT *
    INTO total_stats
    FROM public.get_total_metrics(orgid, v_start_date, v_end_date);
  END IF;

  percent_mau := public.convert_number_to_percent(total_stats.mau, v_plan_mau);
  percent_bandwidth := public.convert_number_to_percent(total_stats.bandwidth, v_plan_bandwidth);
  percent_storage := public.convert_number_to_percent(total_stats.storage, v_plan_storage);
  percent_build_time := public.convert_number_to_percent(total_stats.build_time_unit, v_plan_build_time);

  RETURN QUERY
  SELECT
    GREATEST(percent_mau, percent_bandwidth, percent_storage, percent_build_time),
    percent_mau,
    percent_bandwidth,
    percent_storage,
    percent_build_time;
END;
$$;

ALTER FUNCTION public.get_plan_usage_percent_detailed(uuid) OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.get_plan_usage_percent_detailed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_plan_usage_percent_detailed(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_plan_usage_percent_detailed(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_plan_usage_percent_detailed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_plan_usage_percent_detailed(uuid) TO service_role;
COMMENT ON FUNCTION public.get_plan_usage_percent_detailed(uuid) IS
  'Return current-cycle plan usage percentages (total and per metric) for the supplied organization while respecting read permissions and delegating to cached metrics when running in read-only transactions.';

CREATE OR REPLACE FUNCTION public.get_plan_usage_percent_detailed(
  orgid uuid,
  cycle_start date,
  cycle_end date
)
RETURNS TABLE (
  total_percent double precision,
  mau_percent double precision,
  bandwidth_percent double precision,
  storage_percent double precision,
  build_time_percent double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan_mau bigint;
  v_plan_bandwidth bigint;
  v_plan_storage bigint;
  v_plan_build_time bigint;
  total_stats record;
  percent_mau double precision;
  percent_bandwidth double precision;
  percent_storage double precision;
  percent_build_time double precision;
  v_request_user uuid;
  v_is_service_role boolean;
  v_tx_read_only boolean := current_setting('transaction_read_only') = 'on';
BEGIN
  v_is_service_role := (
    ((SELECT auth.jwt() ->> 'role') = 'service_role')
    OR ((SELECT session_user) IS NOT DISTINCT FROM 'postgres')
  );

  IF NOT v_is_service_role THEN
    v_request_user := public.get_identity_org_allowed(
      '{read,upload,write,all}'::public.key_mode[],
      get_plan_usage_percent_detailed.orgid
    );

    IF v_request_user IS NULL OR NOT public.check_min_rights(
      'read'::public.user_min_right,
      v_request_user,
      get_plan_usage_percent_detailed.orgid,
      NULL::varchar,
      NULL::bigint
    ) THEN
      RAISE EXCEPTION 'NO_RIGHTS';
    END IF;

    v_tx_read_only := TRUE;
  END IF;

  SELECT p.mau, p.bandwidth, p.storage, p.build_time_unit
  INTO v_plan_mau, v_plan_bandwidth, v_plan_storage, v_plan_build_time
  FROM public.orgs o
  JOIN public.stripe_info si ON o.customer_id = si.customer_id
  JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid;

  IF v_tx_read_only THEN
    -- Keep this RPC read-only for authenticated callers. Cache refreshes are
    -- handled by the internal metrics helpers instead of this public entrypoint.
    SELECT *
    INTO total_stats
    FROM public.calculate_org_metrics_cache_entry(orgid, cycle_start, cycle_end);
  ELSE
    SELECT *
    INTO total_stats
    FROM public.get_total_metrics(orgid, cycle_start, cycle_end);
  END IF;

  percent_mau := public.convert_number_to_percent(total_stats.mau, v_plan_mau);
  percent_bandwidth := public.convert_number_to_percent(total_stats.bandwidth, v_plan_bandwidth);
  percent_storage := public.convert_number_to_percent(total_stats.storage, v_plan_storage);
  percent_build_time := public.convert_number_to_percent(total_stats.build_time_unit, v_plan_build_time);

  RETURN QUERY
  SELECT
    GREATEST(percent_mau, percent_bandwidth, percent_storage, percent_build_time),
    percent_mau,
    percent_bandwidth,
    percent_storage,
    percent_build_time;
END;
$$;

ALTER FUNCTION public.get_plan_usage_percent_detailed(uuid, date, date) OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.get_plan_usage_percent_detailed(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_plan_usage_percent_detailed(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_plan_usage_percent_detailed(uuid, date, date) TO anon;
GRANT EXECUTE ON FUNCTION public.get_plan_usage_percent_detailed(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_plan_usage_percent_detailed(uuid, date, date) TO service_role;
COMMENT ON FUNCTION public.get_plan_usage_percent_detailed(uuid, date, date) IS
  'Return plan usage percentages for the supplied date range after verifying read access; read-only callers stay read-only by using the cached metrics helper.';
