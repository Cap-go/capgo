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
