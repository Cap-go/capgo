-- Optimization for is_good_plan_v5_org function
-- This migration adds missing indexes and rewrites the function to:
-- 1. Eliminate redundant subqueries (fetched subscription dates twice)
-- 2. Add missing composite index on daily_version (app_id, date)
-- 3. Add covering index on stripe_info for plan lookups
-- 4. Add partial index on app_versions for storage calculation
-- 5. Early exit for Enterprise plans (skip metrics calculation)

-- Step 1: Add missing indexes

-- Fix daily_version missing date in composite index (was only app_id)
CREATE INDEX IF NOT EXISTS idx_daily_version_app_id_date
ON public.daily_version (app_id, date);

-- Covering index for stripe_info to avoid heap access during plan lookups
CREATE INDEX IF NOT EXISTS idx_stripe_info_customer_covering
ON public.stripe_info (customer_id)
INCLUDE (product_id, subscription_anchor_start, subscription_anchor_end);

-- Partial index for storage calculation (only non-deleted versions)
CREATE INDEX IF NOT EXISTS idx_app_versions_owner_org_not_deleted
ON public.app_versions (owner_org)
WHERE deleted = false;

-- Step 2: Rewrite is_good_plan_v5_org with optimizations
DROP FUNCTION IF EXISTS public.is_good_plan_v5_org(uuid);

CREATE FUNCTION public.is_good_plan_v5_org(orgid uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_product_id text;
  v_start_date date;
  v_end_date date;
  v_plan_name text;
  total_metrics RECORD;
BEGIN
  -- Single query for all org/stripe info (eliminates 2 separate subqueries)
  SELECT
    si.product_id,
    si.subscription_anchor_start::date,
    si.subscription_anchor_end::date
  INTO v_product_id, v_start_date, v_end_date
  FROM public.orgs o
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  WHERE o.id = orgid;

  -- Get plan name directly (inlined, avoids get_current_plan_name_org function call)
  SELECT p.name INTO v_plan_name
  FROM public.plans p
  WHERE p.stripe_id = v_product_id;
 
  -- Early exit for Enterprise plans (skip expensive metrics calculation)
  IF v_plan_name = 'Enterprise' THEN
    RETURN TRUE;
  END IF;

  -- Get metrics (uses existing cache via get_total_metrics)
  SELECT * INTO total_metrics
  FROM public.get_total_metrics(orgid, v_start_date, v_end_date);

  -- Direct plan fit check (inlined find_fit_plan_v3 logic)
  RETURN EXISTS (
    SELECT 1 FROM public.plans p
    WHERE p.name = v_plan_name
      AND p.mau >= total_metrics.mau
      AND p.bandwidth >= total_metrics.bandwidth
      AND p.storage >= total_metrics.storage
      AND p.build_time_unit >= COALESCE(total_metrics.build_time_unit, 0)
  );
END;
$$;

ALTER FUNCTION public.is_good_plan_v5_org(uuid) OWNER TO "postgres";

GRANT ALL ON FUNCTION public.is_good_plan_v5_org(uuid) TO "anon";
GRANT ALL ON FUNCTION public.is_good_plan_v5_org(uuid) TO "authenticated";
GRANT ALL ON FUNCTION public.is_good_plan_v5_org(uuid) TO "service_role";

-- Step 3: Optimize get_current_plan_max_org (eliminates 3 nested subqueries)
DROP FUNCTION IF EXISTS public.get_current_plan_max_org(uuid);

CREATE FUNCTION public.get_current_plan_max_org(orgid uuid) RETURNS TABLE (
    mau bigint,
    bandwidth bigint,
    storage bigint,
    build_time_unit bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT p.mau, p.bandwidth, p.storage, p.build_time_unit
  FROM public.orgs o
  JOIN public.stripe_info si ON o.customer_id = si.customer_id
  JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid;
END;
$$;

ALTER FUNCTION public.get_current_plan_max_org(uuid) OWNER TO "postgres";

GRANT ALL ON FUNCTION public.get_current_plan_max_org(uuid) TO "anon";
GRANT ALL ON FUNCTION public.get_current_plan_max_org(uuid) TO "authenticated";
GRANT ALL ON FUNCTION public.get_current_plan_max_org(uuid) TO "service_role";

-- Step 4: Optimize get_plan_usage_percent_detailed (1-arg version)
-- Problem: Calls get_current_plan_max_org + get_total_metrics separately
-- Solution: Single query for plan limits, reuse optimized get_total_metrics
DROP FUNCTION IF EXISTS public.get_plan_usage_percent_detailed(uuid);

CREATE FUNCTION public.get_plan_usage_percent_detailed(orgid uuid)
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
  total_stats RECORD;
  percent_mau double precision;
  percent_bandwidth double precision;
  percent_storage double precision;
  percent_build_time double precision;
BEGIN
  -- Single query for org/stripe info and plan limits
  SELECT
    si.subscription_anchor_start::date,
    si.subscription_anchor_end::date,
    p.mau,
    p.bandwidth,
    p.storage,
    p.build_time_unit
  INTO v_start_date, v_end_date,
       v_plan_mau, v_plan_bandwidth, v_plan_storage, v_plan_build_time
  FROM public.orgs o
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  LEFT JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid;

  -- Get metrics using optimized function
  SELECT * INTO total_stats
  FROM public.get_total_metrics(orgid, v_start_date, v_end_date);

  -- Calculate percentages
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

ALTER FUNCTION public.get_plan_usage_percent_detailed(uuid) OWNER TO "postgres";

GRANT ALL ON FUNCTION public.get_plan_usage_percent_detailed(uuid) TO "anon";
GRANT ALL ON FUNCTION public.get_plan_usage_percent_detailed(uuid) TO "authenticated";
GRANT ALL ON FUNCTION public.get_plan_usage_percent_detailed(uuid) TO "service_role";

-- Step 5: Optimize get_plan_usage_percent_detailed (3-arg version with cycle dates)
DROP FUNCTION IF EXISTS public.get_plan_usage_percent_detailed(uuid, date, date);

CREATE FUNCTION public.get_plan_usage_percent_detailed(
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
BEGIN
  -- Single query for plan limits (inlined get_current_plan_max_org)
  SELECT p.mau, p.bandwidth, p.storage, p.build_time_unit
  INTO v_plan_mau, v_plan_bandwidth, v_plan_storage, v_plan_build_time
  FROM public.orgs o
  JOIN public.stripe_info si ON o.customer_id = si.customer_id
  JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid;

  -- Get metrics for specified cycle
  SELECT * INTO total_stats
  FROM public.get_total_metrics(orgid, cycle_start, cycle_end);

  -- Calculate percentages
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

ALTER FUNCTION public.get_plan_usage_percent_detailed(uuid, date, date) OWNER TO "postgres";

GRANT ALL ON FUNCTION public.get_plan_usage_percent_detailed(uuid, date, date) TO "anon";
GRANT ALL ON FUNCTION public.get_plan_usage_percent_detailed(uuid, date, date) TO "authenticated";
GRANT ALL ON FUNCTION public.get_plan_usage_percent_detailed(uuid, date, date) TO "service_role";

-- Step 6: Optimize get_total_metrics (3-arg version)
-- Problem: Aggregates from get_app_metrics which returns per-app per-day data, then sums
-- Solution: Direct aggregation from daily tables, each aggregated separately to avoid Cartesian product
DROP FUNCTION IF EXISTS public.get_total_metrics(uuid, date, date);

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
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
    v_mau bigint;
    v_bandwidth bigint;
    v_build_time bigint;
    v_get bigint;
    v_fail bigint;
    v_install bigint;
    v_uninstall bigint;
    v_storage bigint;
BEGIN
    -- Get all app_ids for this org (active + deleted)
    -- Aggregate each metric table separately to avoid Cartesian product

    -- MAU
    SELECT COALESCE(SUM(dm.mau), 0)::bigint INTO v_mau
    FROM public.daily_mau dm
    WHERE dm.app_id IN (
        SELECT apps.app_id FROM public.apps WHERE apps.owner_org = org_id
        UNION
        SELECT deleted_apps.app_id FROM public.deleted_apps WHERE deleted_apps.owner_org = org_id
    )
    AND dm.date BETWEEN start_date AND end_date;

    -- Bandwidth
    SELECT COALESCE(SUM(db.bandwidth), 0)::bigint INTO v_bandwidth
    FROM public.daily_bandwidth db
    WHERE db.app_id IN (
        SELECT apps.app_id FROM public.apps WHERE apps.owner_org = org_id
        UNION
        SELECT deleted_apps.app_id FROM public.deleted_apps WHERE deleted_apps.owner_org = org_id
    )
    AND db.date BETWEEN start_date AND end_date;

    -- Build time
    SELECT COALESCE(SUM(dbt.build_time_unit), 0)::bigint INTO v_build_time
    FROM public.daily_build_time dbt
    WHERE dbt.app_id IN (
        SELECT apps.app_id FROM public.apps WHERE apps.owner_org = org_id
        UNION
        SELECT deleted_apps.app_id FROM public.deleted_apps WHERE deleted_apps.owner_org = org_id
    )
    AND dbt.date BETWEEN start_date AND end_date;

    -- Version stats (get, fail, install, uninstall)
    SELECT
        COALESCE(SUM(dv.get), 0)::bigint,
        COALESCE(SUM(dv.fail), 0)::bigint,
        COALESCE(SUM(dv.install), 0)::bigint,
        COALESCE(SUM(dv.uninstall), 0)::bigint
    INTO v_get, v_fail, v_install, v_uninstall
    FROM public.daily_version dv
    WHERE dv.app_id IN (
        SELECT apps.app_id FROM public.apps WHERE apps.owner_org = org_id
        UNION
        SELECT deleted_apps.app_id FROM public.deleted_apps WHERE deleted_apps.owner_org = org_id
    )
    AND dv.date BETWEEN start_date AND end_date;

    -- Storage is calculated separately (current total, not time-series)
    SELECT COALESCE(SUM(avm.size), 0)::bigint INTO v_storage
    FROM public.app_versions av
    INNER JOIN public.app_versions_meta avm ON av.id = avm.id
    WHERE av.owner_org = org_id AND av.deleted = false;

    RETURN QUERY SELECT v_mau, v_storage, v_bandwidth, v_build_time, v_get, v_fail, v_install, v_uninstall;
END;
$$;

ALTER FUNCTION public.get_total_metrics(uuid, date, date) OWNER TO "postgres";

GRANT ALL ON FUNCTION public.get_total_metrics(uuid, date, date) TO "anon";
GRANT ALL ON FUNCTION public.get_total_metrics(uuid, date, date) TO "authenticated";
GRANT ALL ON FUNCTION public.get_total_metrics(uuid, date, date) TO "service_role";

-- Step 7: Optimize get_total_metrics (1-arg version)
-- Problem: Calls get_cycle_info_org with nested subqueries
-- Solution: Inline cycle date calculation
DROP FUNCTION IF EXISTS public.get_total_metrics(uuid);

CREATE FUNCTION public.get_total_metrics(org_id uuid) RETURNS TABLE (
    mau bigint,
    storage bigint,
    bandwidth bigint,
    build_time_unit bigint,
    get bigint,
    fail bigint,
    install bigint,
    uninstall bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
    v_start_date date;
    v_end_date date;
BEGIN
    -- Get cycle dates in single query (inlined get_cycle_info_org)
    SELECT
        si.subscription_anchor_start::date,
        si.subscription_anchor_end::date
    INTO v_start_date, v_end_date
    FROM public.orgs o
    LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
    WHERE o.id = org_id;

    RETURN QUERY SELECT * FROM public.get_total_metrics(org_id, v_start_date, v_end_date);
END;
$$;

ALTER FUNCTION public.get_total_metrics(uuid) OWNER TO "postgres";

GRANT ALL ON FUNCTION public.get_total_metrics(uuid) TO "anon";
GRANT ALL ON FUNCTION public.get_total_metrics(uuid) TO "authenticated";
GRANT ALL ON FUNCTION public.get_total_metrics(uuid) TO "service_role";
