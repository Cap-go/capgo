-- Migration: Add auth.uid() + org membership checks to SECURITY DEFINER functions
-- 
-- These 7 info-disclosure functions accept an org_id parameter but never verify
-- that the calling user belongs to that organization. Any authenticated user can
-- query metrics, plan info, and usage stats for ANY organization by passing an
-- arbitrary org_id. This migration adds org_users membership checks so only
-- members of an organization can access its data.
--
-- Affected functions:
--   1. get_app_metrics(org_id, start_date, end_date)
--   2. get_current_plan_max_org(orgid)
--   3. get_current_plan_name_org(orgid)
--   4. get_plan_usage_percent_detailed(orgid)
--   5. get_plan_usage_percent_detailed(orgid, cycle_start, cycle_end)
--   6. get_total_app_storage_size_orgs(org_id, app_id)
--   7. get_total_storage_size_org(org_id)
--   8. is_good_plan_v5_org(orgid)
--
-- The get_app_metrics(org_id) single-arg wrapper delegates to the 3-arg version
-- which already gets the check, so it does not need its own guard.

-- =============================================================================
-- 1. get_app_metrics(org_id uuid, start_date date, end_date date)
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."get_app_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") RETURNS TABLE("app_id" character varying, "date" "date", "mau" bigint, "storage" bigint, "bandwidth" bigint, "build_time_unit" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    cache_entry public.app_metrics_cache%ROWTYPE;
    org_exists boolean;
BEGIN
    -- Cross-tenant guard: verify caller belongs to this org
    IF NOT EXISTS (
        SELECT 1 FROM public.org_users
        WHERE org_users.org_id = get_app_metrics.org_id
          AND org_users.user_id = (SELECT auth.uid())
    ) THEN
        RETURN;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.orgs WHERE id = get_app_metrics.org_id
    ) INTO org_exists;

    IF NOT org_exists THEN
        RETURN;
    END IF;

    SELECT *
    INTO cache_entry
    FROM public.app_metrics_cache
    WHERE app_metrics_cache.org_id = get_app_metrics.org_id;

    IF cache_entry.id IS NULL
        OR cache_entry.start_date IS DISTINCT FROM get_app_metrics.start_date
        OR cache_entry.end_date IS DISTINCT FROM get_app_metrics.end_date
        OR cache_entry.cached_at IS NULL
        OR cache_entry.cached_at < (now() - interval '5 minutes') THEN
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

-- =============================================================================
-- 2. get_current_plan_max_org(orgid uuid)
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") RETURNS TABLE("mau" bigint, "bandwidth" bigint, "storage" bigint, "build_time_unit" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Cross-tenant guard: verify caller belongs to this org
  IF NOT EXISTS (
      SELECT 1 FROM public.org_users
      WHERE org_users.org_id = get_current_plan_max_org.orgid
        AND org_users.user_id = (SELECT auth.uid())
  ) THEN
      RETURN;
  END IF;

  RETURN QUERY
  SELECT p.mau, p.bandwidth, p.storage, p.build_time_unit
  FROM public.orgs o
  JOIN public.stripe_info si ON o.customer_id = si.customer_id
  JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid;
END;
$$;

-- =============================================================================
-- 3. get_current_plan_name_org(orgid uuid)
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."get_current_plan_name_org"("orgid" "uuid") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Cross-tenant guard: verify caller belongs to this org
  IF NOT EXISTS (
      SELECT 1 FROM public.org_users
      WHERE org_users.org_id = get_current_plan_name_org.orgid
        AND org_users.user_id = (SELECT auth.uid())
  ) THEN
      RETURN NULL;
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

-- =============================================================================
-- 4. get_plan_usage_percent_detailed(orgid uuid)
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid") RETURNS TABLE("total_percent" double precision, "mau_percent" double precision, "bandwidth_percent" double precision, "storage_percent" double precision, "build_time_percent" double precision)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  -- Cross-tenant guard: verify caller belongs to this org
  IF NOT EXISTS (
      SELECT 1 FROM public.org_users
      WHERE org_users.org_id = get_plan_usage_percent_detailed.orgid
        AND org_users.user_id = (SELECT auth.uid())
  ) THEN
      RETURN;
  END IF;

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
  IF v_anchor_day > now() - date_trunc('MONTH', now()) THEN
    v_start_date := (date_trunc('MONTH', now() - INTERVAL '1 MONTH') + v_anchor_day)::date;
  ELSE
    v_start_date := (date_trunc('MONTH', now()) + v_anchor_day)::date;
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

-- =============================================================================
-- 5. get_plan_usage_percent_detailed(orgid uuid, cycle_start date, cycle_end date)
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid", "cycle_start" "date", "cycle_end" "date") RETURNS TABLE("total_percent" double precision, "mau_percent" double precision, "bandwidth_percent" double precision, "storage_percent" double precision, "build_time_percent" double precision)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  -- Cross-tenant guard: verify caller belongs to this org
  IF NOT EXISTS (
      SELECT 1 FROM public.org_users
      WHERE org_users.org_id = get_plan_usage_percent_detailed.orgid
        AND org_users.user_id = (SELECT auth.uid())
  ) THEN
      RETURN;
  END IF;

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

-- =============================================================================
-- 6. get_total_app_storage_size_orgs(org_id uuid, app_id varchar)
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) RETURNS double precision
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    total_size double precision := 0;
BEGIN
    -- Cross-tenant guard: verify caller belongs to this org
    IF NOT EXISTS (
        SELECT 1 FROM public.org_users
        WHERE org_users.org_id = get_total_app_storage_size_orgs.org_id
          AND org_users.user_id = (SELECT auth.uid())
    ) THEN
        RETURN 0;
    END IF;

    SELECT COALESCE(SUM(app_versions_meta.size), 0) INTO total_size
    FROM public.app_versions
    INNER JOIN public.app_versions_meta ON app_versions.id = app_versions_meta.id
    WHERE app_versions.owner_org = org_id
    AND app_versions.app_id = get_total_app_storage_size_orgs.app_id
    AND app_versions.deleted = false;

    RETURN total_size;
END;  
$$;

-- =============================================================================
-- 7. get_total_storage_size_org(org_id uuid)
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") RETURNS double precision
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    total_size double precision := 0;
BEGIN
    -- Cross-tenant guard: verify caller belongs to this org
    IF NOT EXISTS (
        SELECT 1 FROM public.org_users
        WHERE org_users.org_id = get_total_storage_size_org.org_id
          AND org_users.user_id = (SELECT auth.uid())
    ) THEN
        RETURN 0;
    END IF;

    SELECT COALESCE(SUM(app_versions_meta.size), 0) INTO total_size
    FROM public.app_versions
    INNER JOIN public.app_versions_meta ON app_versions.id = app_versions_meta.id
    WHERE app_versions.owner_org = org_id
    AND app_versions.deleted = false;

    RETURN total_size;
END;  
$$;

-- =============================================================================
-- 8. is_good_plan_v5_org(orgid uuid)
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_product_id text;
  v_start_date date;
  v_end_date date;
  v_plan_name text;
  total_metrics RECORD;
  v_anchor_day INTERVAL;
BEGIN
  -- Cross-tenant guard: verify caller belongs to this org
  IF NOT EXISTS (
      SELECT 1 FROM public.org_users
      WHERE org_users.org_id = is_good_plan_v5_org.orgid
        AND org_users.user_id = (SELECT auth.uid())
  ) THEN
      RETURN FALSE;
  END IF;

  -- Get product_id and calculate current billing cycle (properly inlined get_cycle_info_org)
  SELECT
    si.product_id,
    COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
  INTO v_product_id, v_anchor_day
  FROM public.orgs o
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  WHERE o.id = orgid;

  -- Calculate current billing cycle dates based on anchor day
  IF v_anchor_day > now() - date_trunc('MONTH', now()) THEN
    v_start_date := (date_trunc('MONTH', now() - INTERVAL '1 MONTH') + v_anchor_day)::date;
  ELSE
    v_start_date := (date_trunc('MONTH', now()) + v_anchor_day)::date;
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
