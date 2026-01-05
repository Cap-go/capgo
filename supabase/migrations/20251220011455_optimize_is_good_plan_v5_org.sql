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
  v_anchor_day INTERVAL;
BEGIN
  -- Get product_id and calculate current billing cycle (properly inlined get_cycle_info_org)
  SELECT
    si.product_id,
    COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
  INTO v_product_id, v_anchor_day
  FROM public.orgs o
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  WHERE o.id = orgid;

  -- Calculate current billing cycle dates based on anchor day
  IF v_anchor_day > NOW() - date_trunc('MONTH', NOW()) THEN
    v_start_date := (date_trunc('MONTH', NOW() - INTERVAL '1 MONTH') + v_anchor_day)::date;
  ELSE
    v_start_date := (date_trunc('MONTH', NOW()) + v_anchor_day)::date;
  END IF;
  v_end_date := (v_start_date + INTERVAL '1 MONTH')::date;

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

GRANT ALL ON FUNCTION public.is_good_plan_v5_org(uuid) TO anon;
GRANT ALL ON FUNCTION public.is_good_plan_v5_org(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_good_plan_v5_org(uuid) TO service_role;

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

GRANT ALL ON FUNCTION public.get_current_plan_max_org(uuid) TO anon;
GRANT ALL ON FUNCTION public.get_current_plan_max_org(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_current_plan_max_org(uuid) TO service_role;

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
  v_anchor_day INTERVAL;
  total_stats RECORD;
  percent_mau double precision;
  percent_bandwidth double precision;
  percent_storage double precision;
  percent_build_time double precision;
BEGIN
  -- Single query for org/stripe info and plan limits (get anchor day for cycle calculation)
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

  -- Calculate current billing cycle dates based on anchor day
  IF v_anchor_day > NOW() - date_trunc('MONTH', NOW()) THEN
    v_start_date := (date_trunc('MONTH', NOW() - INTERVAL '1 MONTH') + v_anchor_day)::date;
  ELSE
    v_start_date := (date_trunc('MONTH', NOW()) + v_anchor_day)::date;
  END IF;
  v_end_date := (v_start_date + INTERVAL '1 MONTH')::date;

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

GRANT ALL ON FUNCTION public.get_plan_usage_percent_detailed(uuid) TO anon;
GRANT ALL ON FUNCTION public.get_plan_usage_percent_detailed(
    uuid
) TO authenticated;
GRANT ALL ON FUNCTION public.get_plan_usage_percent_detailed(
    uuid
) TO service_role;

-- Step 5: Optimize get_plan_usage_percent_detailed (3-arg version with cycle dates)
DROP FUNCTION IF EXISTS public.get_plan_usage_percent_detailed(
    uuid, date, date
);

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

ALTER FUNCTION public.get_plan_usage_percent_detailed(
    uuid, date, date
) OWNER TO "postgres";

GRANT ALL ON FUNCTION public.get_plan_usage_percent_detailed(
    uuid, date, date
) TO anon;
GRANT ALL ON FUNCTION public.get_plan_usage_percent_detailed(
    uuid, date, date
) TO authenticated;
GRANT ALL ON FUNCTION public.get_plan_usage_percent_detailed(
    uuid, date, date
) TO service_role;

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

GRANT ALL ON FUNCTION public.get_total_metrics(uuid, date, date) TO anon;
GRANT ALL ON FUNCTION public.get_total_metrics(
    uuid, date, date
) TO authenticated;
GRANT ALL ON FUNCTION public.get_total_metrics(
    uuid, date, date
) TO service_role;

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
    v_anchor_day INTERVAL;
BEGIN
    -- Get anchor day for cycle calculation (properly inlined get_cycle_info_org)
    SELECT
        COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
    INTO v_anchor_day
    FROM public.orgs o
    LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
    WHERE o.id = org_id;

    -- Calculate current billing cycle dates based on anchor day
    IF v_anchor_day > NOW() - date_trunc('MONTH', NOW()) THEN
        v_start_date := (date_trunc('MONTH', NOW() - INTERVAL '1 MONTH') + v_anchor_day)::date;
    ELSE
        v_start_date := (date_trunc('MONTH', NOW()) + v_anchor_day)::date;
    END IF;
    v_end_date := (v_start_date + INTERVAL '1 MONTH')::date;

    RETURN QUERY SELECT * FROM public.get_total_metrics(org_id, v_start_date, v_end_date);
END;
$$;

ALTER FUNCTION public.get_total_metrics(uuid) OWNER TO "postgres";

GRANT ALL ON FUNCTION public.get_total_metrics(uuid) TO anon;
GRANT ALL ON FUNCTION public.get_total_metrics(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_total_metrics(uuid) TO service_role;

-- Step 8: Optimize get_orgs_v6(userid uuid)
-- Problem: Calls 7+ functions per row (is_paying_org, is_trial_org, is_allowed_action_org, etc.)
-- Each function queries orgs → stripe_info separately
-- Solution: Single JOIN to stripe_info, compute all flags inline
DROP FUNCTION IF EXISTS public.get_orgs_v6(uuid);

CREATE FUNCTION public.get_orgs_v6(userid uuid)
RETURNS TABLE (
    gid uuid,
    created_by uuid,
    logo text,
    name text,
    role character varying,
    paying boolean,
    trial_left integer,
    can_use_more boolean,
    is_canceled boolean,
    app_count bigint,
    subscription_start timestamptz,
    subscription_end timestamptz,
    management_email text,
    is_yearly boolean,
    stats_updated_at timestamp without time zone,
    next_stats_update_at timestamptz,
    credit_available numeric,
    credit_total numeric,
    credit_next_expiration timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  WITH app_counts AS (
    SELECT owner_org, COUNT(*) as cnt
    FROM public.apps
    GROUP BY owner_org
  ),
  -- Compute next stats update info for all paying orgs at once
  paying_orgs_ordered AS (
    SELECT
      o.id,
      ROW_NUMBER() OVER (ORDER BY o.id ASC) - 1 as preceding_count
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    WHERE (
      (si.status = 'succeeded'
        AND (si.canceled_at IS NULL OR si.canceled_at > NOW())
        AND si.subscription_anchor_end > NOW())
      OR si.trial_at > NOW()
    )
  ),
  -- Calculate current billing cycle for each org (properly inlined get_cycle_info_org logic)
  -- anchor_day = day of month when billing cycle starts (extracted from original subscription_anchor_start)
  -- If we're before anchor_day this month, cycle started last month; otherwise cycle started this month
  billing_cycles AS (
    SELECT
      o.id AS org_id,
      -- Calculate cycle_start based on anchor day and current date
      CASE
        WHEN COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
             > NOW() - date_trunc('MONTH', NOW())
        THEN date_trunc('MONTH', NOW() - INTERVAL '1 MONTH')
             + COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
        ELSE date_trunc('MONTH', NOW())
             + COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
      END AS cycle_start
    FROM public.orgs o
    LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  )
  SELECT
    o.id AS gid,
    o.created_by,
    o.logo,
    o.name,
    ou.user_right::varchar AS role,
    -- is_paying_org: status = 'succeeded'
    (si.status = 'succeeded') AS paying,
    -- is_trial_org: days left in trial
    GREATEST(COALESCE((si.trial_at::date - NOW()::date), 0), 0)::integer AS trial_left,
    -- is_allowed_action_org (= is_paying_and_good_plan_org): paying with good plan OR in trial
    ((si.status = 'succeeded' AND si.is_good_plan = true) OR (si.trial_at::date - NOW()::date > 0)) AS can_use_more,
    -- is_canceled_org: status = 'canceled'
    (si.status = 'canceled') AS is_canceled,
    -- app_count
    COALESCE(ac.cnt, 0) AS app_count,
    -- subscription dates (properly calculated current billing cycle)
    bc.cycle_start AS subscription_start,
    (bc.cycle_start + INTERVAL '1 MONTH') AS subscription_end,
    o.management_email,
    -- is_org_yearly
    COALESCE(si.price_id = p.price_y_id, false) AS is_yearly,
    o.stats_updated_at,
    -- get_next_stats_update_date (simplified - just add 4 min intervals based on position)
    CASE
      WHEN poo.id IS NOT NULL THEN
        public.get_next_cron_time('0 3 * * *', NOW()) + make_interval(mins => poo.preceding_count::int * 4)
      ELSE NULL
    END AS next_stats_update_at,
    COALESCE(ucb.available_credits, 0) AS credit_available,
    COALESCE(ucb.total_credits, 0) AS credit_total,
    ucb.next_expiration AS credit_next_expiration
  FROM public.orgs o
  JOIN public.org_users ou ON ou.user_id = userid AND o.id = ou.org_id
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  LEFT JOIN public.plans p ON si.product_id = p.stripe_id
  LEFT JOIN app_counts ac ON ac.owner_org = o.id
  LEFT JOIN public.usage_credit_balances ucb ON ucb.org_id = o.id
  LEFT JOIN paying_orgs_ordered poo ON poo.id = o.id
  LEFT JOIN billing_cycles bc ON bc.org_id = o.id;
END;
$$;

ALTER FUNCTION public.get_orgs_v6(uuid) OWNER TO "postgres";

GRANT ALL ON FUNCTION public.get_orgs_v6(uuid) TO anon;
GRANT ALL ON FUNCTION public.get_orgs_v6(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_orgs_v6(uuid) TO service_role;
