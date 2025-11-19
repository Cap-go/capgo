-- Complete Native Build System
-- This single migration adds ALL native build functionality:
-- 1. Build time tracking (seconds-based, credit system integration)
-- 2. Build requests table for upload/build workflows  
-- 3. Database functions (RPC) for build operations
-- 4. Updated plan functions to include build_time_percent
BEGIN;

-- ==================================================
-- PART 1: BUILD TIME TRACKING
-- ==================================================
-- Add build_time_seconds to plans
ALTER TABLE public.plans
ADD COLUMN build_time_seconds bigint DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.plans.build_time_seconds IS 'Maximum build time in seconds per billing cycle';

-- Add build_time_exceeded flag to stripe_info
ALTER TABLE public.stripe_info
ADD COLUMN build_time_exceeded boolean DEFAULT false;

COMMENT ON COLUMN public.stripe_info.build_time_exceeded IS 'Organization exceeded build time limit';

-- Extend enums for build_time
ALTER TYPE public.credit_metric_type
ADD VALUE IF NOT EXISTS 'build_time';

ALTER TYPE public.action_type
ADD VALUE IF NOT EXISTS 'build_time';

-- Build logs - BILLING ONLY: tracks build time for charging orgs
-- Platform multipliers: android=1x, ios=2x
CREATE TABLE IF NOT EXISTS public.build_logs (
  id uuid DEFAULT extensions.uuid_generate_v4 () PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  -- Who to bill
  org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  -- External reference
  build_id character varying NOT NULL,
  -- Raw build time
  platform character varying NOT NULL CHECK (platform IN ('ios', 'android')),
  build_time_seconds bigint NOT NULL CHECK (build_time_seconds >= 0),
  -- Billable amount (with platform multiplier applied: android=1x, ios=2x)
  -- This locks in the price at time of build
  billable_seconds bigint NOT NULL CHECK (billable_seconds >= 0),
  UNIQUE (build_id, org_id)
);

CREATE INDEX idx_build_logs_org_created ON public.build_logs (org_id, created_at DESC);

ALTER TABLE public.build_logs ENABLE ROW LEVEL SECURITY;

-- Users can view:
-- 1. Their own builds
-- 2. All org builds if they're admin/super_admin
CREATE POLICY "Users read own or org admin builds" ON public.build_logs FOR
SELECT
  TO authenticated USING (
    user_id = (
      SELECT
        auth.uid ()
    )
    OR EXISTS (
      SELECT
        1
      FROM
        public.org_users
      WHERE
        org_users.org_id = build_logs.org_id
        AND org_users.user_id = (
          SELECT
            auth.uid ()
        )
        AND org_users.user_right IN ('super_admin', 'admin')
    )
  );

-- Only service role can write (backend records builds)
CREATE POLICY "Service role manages build logs" ON public.build_logs FOR ALL TO service_role USING (true)
WITH
  CHECK (true);

-- Daily build time aggregates per app/day for reporting
CREATE TABLE IF NOT EXISTS public.daily_build_time (
  app_id character varying NOT NULL REFERENCES public.apps (app_id) ON DELETE CASCADE,
  date date NOT NULL,
  build_time_seconds bigint NOT NULL DEFAULT 0 CHECK (build_time_seconds >= 0),
  build_count bigint NOT NULL DEFAULT 0 CHECK (build_count >= 0),
  PRIMARY KEY (app_id, date)
);

CREATE INDEX idx_daily_build_time_app_date ON public.daily_build_time (app_id, date);

ALTER TABLE public.daily_build_time ENABLE ROW LEVEL SECURITY;

-- Users can view build time data for apps in their organization
CREATE POLICY "Users read own org build time" ON public.daily_build_time FOR
SELECT
  TO authenticated USING (
    EXISTS (
      SELECT
        1
      FROM
        public.apps
      WHERE
        apps.app_id = daily_build_time.app_id
        AND EXISTS (
          SELECT
            1
          FROM
            public.org_users
          WHERE
            org_users.org_id = apps.owner_org
            AND org_users.user_id = (
              SELECT
                auth.uid ()
            )
        )
    )
  );

-- Only service role can write (backend records build metrics)
CREATE POLICY "Service role manages build time" ON public.daily_build_time FOR ALL TO service_role USING (true)
WITH
  CHECK (true);

-- Build requests - stores native build jobs requested via API
CREATE TABLE IF NOT EXISTS public.build_requests (
  id uuid DEFAULT extensions.uuid_generate_v4 () PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  app_id character varying NOT NULL REFERENCES public.apps (app_id) ON DELETE CASCADE,
  owner_org uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  platform character varying NOT NULL CHECK (platform IN ('ios', 'android', 'both')),
  build_mode character varying NOT NULL DEFAULT 'release',
  build_config jsonb DEFAULT '{}'::jsonb,
  status character varying NOT NULL DEFAULT 'pending',
  builder_job_id character varying,
  upload_session_key character varying NOT NULL,
  upload_path character varying NOT NULL,
  upload_url character varying NOT NULL,
  upload_expires_at timestamptz NOT NULL,
  last_error text
);

CREATE INDEX idx_build_requests_app ON public.build_requests (app_id);

CREATE INDEX idx_build_requests_org ON public.build_requests (owner_org);

CREATE INDEX idx_build_requests_job ON public.build_requests (builder_job_id);

ALTER TABLE public.build_requests ENABLE ROW LEVEL SECURITY;

-- Users can view build requests for apps in their organization
CREATE POLICY "Users read own org build requests" ON public.build_requests FOR
SELECT
  TO authenticated USING (
    EXISTS (
      SELECT
        1
      FROM
        public.org_users
      WHERE
        org_users.org_id = build_requests.owner_org
        AND org_users.user_id = (
          SELECT
            auth.uid ()
        )
    )
  );

CREATE POLICY "Service role manages build requests" ON public.build_requests FOR ALL TO service_role USING (true)
WITH
  CHECK (true);

CREATE TRIGGER handle_build_requests_updated_at BEFORE
UPDATE ON public.build_requests FOR EACH ROW
EXECUTE FUNCTION moddatetime ('updated_at');

-- Note: No daily aggregation needed - just query build_logs for billing
-- Note: builder.capgo.app manages its own R2 storage; this table only stores metadata
-- Grant permissions for PostgREST access
GRANT ALL ON public.build_logs TO postgres,
anon,
authenticated,
service_role;

GRANT ALL ON public.daily_build_time TO postgres,
anon,
authenticated,
service_role;

GRANT ALL ON public.build_requests TO postgres,
anon,
authenticated,
service_role;

COMMIT;

-- ==================================================
-- PART 3: RPC FUNCTIONS FOR BUILD OPERATIONS
-- ==================================================
-- Function: record_build_time - BILLING ONLY
-- Applies platform multiplier: android=1x, ios=2x
CREATE OR REPLACE FUNCTION public.record_build_time (
  p_org_id uuid,
  p_user_id uuid,
  p_build_id character varying,
  p_platform character varying,
  p_build_time_seconds bigint
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  v_build_log_id uuid;
  v_multiplier numeric;
  v_billable_seconds bigint;
BEGIN
  IF p_build_time_seconds < 0 THEN RAISE EXCEPTION 'Build time cannot be negative'; END IF;
  IF p_platform NOT IN ('ios', 'android') THEN RAISE EXCEPTION 'Invalid platform: %', p_platform; END IF;

  -- Apply platform multiplier
  v_multiplier := CASE p_platform
    WHEN 'ios' THEN 2
    WHEN 'android' THEN 1
    ELSE 1
  END;

  v_billable_seconds := (p_build_time_seconds * v_multiplier)::bigint;

  INSERT INTO public.build_logs (org_id, user_id, build_id, platform, build_time_seconds, billable_seconds)
  VALUES (p_org_id, p_user_id, p_build_id, p_platform, p_build_time_seconds, v_billable_seconds)
  ON CONFLICT (build_id, org_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    platform = EXCLUDED.platform,
    build_time_seconds = EXCLUDED.build_time_seconds,
    billable_seconds = EXCLUDED.billable_seconds
  RETURNING id INTO v_build_log_id;

  RETURN v_build_log_id;
END;
$$;

-- Function: get_org_build_time_seconds
CREATE OR REPLACE FUNCTION public.get_org_build_time_seconds (p_org_id uuid, p_start_date date, p_end_date date) RETURNS TABLE (
  total_build_time_seconds bigint,
  total_builds bigint
) LANGUAGE plpgsql STABLE
SET
  search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT COALESCE(SUM(dbt.build_time_seconds), 0)::bigint, COALESCE(SUM(dbt.build_count), 0)::bigint
  FROM public.daily_build_time dbt
  INNER JOIN public.apps a ON a.app_id = dbt.app_id
  WHERE a.owner_org = p_org_id AND dbt.date >= p_start_date AND dbt.date <= p_end_date;
END;
$$;

-- Function: is_build_time_exceeded_by_org
CREATE OR REPLACE FUNCTION public.is_build_time_exceeded_by_org (org_id uuid) RETURNS boolean LANGUAGE plpgsql STABLE
SET
  search_path = '' AS $$
BEGIN
  RETURN (SELECT build_time_exceeded FROM public.stripe_info
    WHERE stripe_info.customer_id = (SELECT customer_id FROM public.orgs WHERE id = is_build_time_exceeded_by_org.org_id));
END;
$$;

GRANT ALL ON FUNCTION public.is_build_time_exceeded_by_org (uuid) TO anon,
authenticated,
service_role;

-- Function: set_build_time_exceeded_by_org
CREATE OR REPLACE FUNCTION public.set_build_time_exceeded_by_org (org_id uuid, disabled boolean) RETURNS void LANGUAGE plpgsql
SET
  search_path = '' AS $$
BEGIN
  UPDATE public.stripe_info SET build_time_exceeded = disabled
  WHERE stripe_info.customer_id = (SELECT customer_id FROM public.orgs WHERE id = set_build_time_exceeded_by_org.org_id);
END;
$$;

GRANT ALL ON FUNCTION public.set_build_time_exceeded_by_org (uuid, boolean) TO anon,
authenticated,
service_role;

-- Note: No create_build_request RPC needed - backend TypeScript handles builder.capgo.app API calls
-- ==================================================
-- PART 4: UPDATE EXISTING FUNCTIONS WITH BUILD_TIME_SECONDS
-- ==================================================
-- Update get_app_metrics
DROP FUNCTION IF EXISTS public.get_app_metrics (uuid);

DROP FUNCTION IF EXISTS public.get_app_metrics (uuid, date, date);

CREATE FUNCTION public.get_app_metrics (org_id uuid, start_date date, end_date date) RETURNS TABLE (
  app_id character varying,
  date date,
  mau bigint,
  storage bigint,
  bandwidth bigint,
  build_time_seconds bigint,
  get bigint,
  fail bigint,
  install bigint,
  uninstall bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
  search_path = '' AS $$
BEGIN
  RETURN QUERY
  WITH DateSeries AS (SELECT generate_series(start_date, end_date, '1 day'::interval)::date AS "date"),
  all_apps AS (SELECT apps.app_id FROM public.apps WHERE apps.owner_org = get_app_metrics.org_id
    UNION SELECT deleted_apps.app_id FROM public.deleted_apps WHERE deleted_apps.owner_org = get_app_metrics.org_id)
  SELECT aa.app_id, ds.date::date, COALESCE(dm.mau, 0) AS mau, COALESCE(dst.storage, 0) AS storage,
    COALESCE(db.bandwidth, 0) AS bandwidth, COALESCE(dbt.build_time_seconds, 0) AS build_time_seconds,
    COALESCE(SUM(dv.get)::bigint, 0) AS get, COALESCE(SUM(dv.fail)::bigint, 0) AS fail,
    COALESCE(SUM(dv.install)::bigint, 0) AS install, COALESCE(SUM(dv.uninstall)::bigint, 0) AS uninstall
  FROM all_apps aa CROSS JOIN DateSeries ds
  LEFT JOIN public.daily_mau dm ON aa.app_id = dm.app_id AND ds.date = dm.date
  LEFT JOIN public.daily_storage dst ON aa.app_id = dst.app_id AND ds.date = dst.date
  LEFT JOIN public.daily_bandwidth db ON aa.app_id = db.app_id AND ds.date = db.date
  LEFT JOIN public.daily_build_time dbt ON aa.app_id = dbt.app_id AND ds.date = dbt.date
  LEFT JOIN public.daily_version dv ON aa.app_id = dv.app_id AND ds.date = dv.date
  GROUP BY aa.app_id, ds.date, dm.mau, dst.storage, db.bandwidth, dbt.build_time_seconds
  ORDER BY aa.app_id, ds.date;
END;
$$;

CREATE FUNCTION public.get_app_metrics (org_id uuid) RETURNS TABLE (
  app_id character varying,
  date date,
  mau bigint,
  storage bigint,
  bandwidth bigint,
  build_time_seconds bigint,
  get bigint,
  fail bigint,
  install bigint,
  uninstall bigint
) LANGUAGE plpgsql STABLE
SET
  search_path = '' AS $$
DECLARE cycle_start timestamptz; cycle_end timestamptz;
BEGIN
  SELECT subscription_anchor_start, subscription_anchor_end INTO cycle_start, cycle_end
  FROM public.get_cycle_info_org(org_id);
  RETURN QUERY SELECT * FROM public.get_app_metrics(org_id, cycle_start::date, cycle_end::date);
END;
$$;

-- Update get_total_metrics
DROP FUNCTION IF EXISTS public.get_total_metrics (uuid);

DROP FUNCTION IF EXISTS public.get_total_metrics (uuid, date, date);

CREATE FUNCTION public.get_total_metrics (org_id uuid, start_date date, end_date date) RETURNS TABLE (
  mau bigint,
  storage bigint,
  bandwidth bigint,
  build_time_seconds bigint,
  get bigint,
  fail bigint,
  install bigint,
  uninstall bigint
) LANGUAGE plpgsql STABLE
SET
  search_path = '' AS $$
BEGIN
  RETURN QUERY SELECT COALESCE(SUM(metrics.mau), 0)::bigint, 
    COALESCE(public.get_total_storage_size_org(org_id), 0)::bigint,
    COALESCE(SUM(metrics.bandwidth), 0)::bigint, COALESCE(SUM(metrics.build_time_seconds), 0)::bigint,
    COALESCE(SUM(metrics.get), 0)::bigint, COALESCE(SUM(metrics.fail), 0)::bigint,
    COALESCE(SUM(metrics.install), 0)::bigint, COALESCE(SUM(metrics.uninstall), 0)::bigint
  FROM public.get_app_metrics(org_id, start_date, end_date) AS metrics;
END;
$$;

CREATE FUNCTION public.get_total_metrics (org_id uuid) RETURNS TABLE (
  mau bigint,
  storage bigint,
  bandwidth bigint,
  build_time_seconds bigint,
  get bigint,
  fail bigint,
  install bigint,
  uninstall bigint
) LANGUAGE plpgsql STABLE
SET
  search_path = '' AS $$
DECLARE cycle_start timestamptz; cycle_end timestamptz;
BEGIN
  SELECT subscription_anchor_start, subscription_anchor_end INTO cycle_start, cycle_end
  FROM public.get_cycle_info_org(org_id);
  RETURN QUERY SELECT * FROM public.get_total_metrics(org_id, cycle_start::date, cycle_end::date);
END;
$$;

-- Update find_fit_plan_v3
DROP FUNCTION IF EXISTS public.find_fit_plan_v3 (bigint, bigint, bigint);

CREATE FUNCTION public.find_fit_plan_v3 (
  mau bigint,
  bandwidth bigint,
  storage bigint,
  build_time_seconds bigint DEFAULT 0
) RETURNS TABLE (name character varying) LANGUAGE plpgsql STABLE
SET
  search_path = '' AS $$
BEGIN
  RETURN QUERY (SELECT plans.name FROM public.plans
    WHERE plans.mau >= find_fit_plan_v3.mau AND plans.storage >= find_fit_plan_v3.storage
      AND plans.bandwidth >= find_fit_plan_v3.bandwidth AND plans.build_time_seconds >= find_fit_plan_v3.build_time_seconds
      OR plans.name = 'Pay as you go'
    ORDER BY plans.mau);
END;
$$;

-- Update find_best_plan_v3 to account for build time
DROP FUNCTION IF EXISTS public.find_best_plan_v3 (bigint, double precision, double precision);

CREATE FUNCTION public.find_best_plan_v3 (
  mau bigint,
  bandwidth double precision,
  storage double precision,
  build_time_seconds bigint DEFAULT 0
) RETURNS character varying LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
BEGIN
  RETURN (
    SELECT name
    FROM public.plans
    WHERE (
      plans.mau >= find_best_plan_v3.mau
      AND plans.storage >= find_best_plan_v3.storage
      AND plans.bandwidth >= find_best_plan_v3.bandwidth
      AND plans.build_time_seconds >= find_best_plan_v3.build_time_seconds
    ) OR plans.name = 'Pay as you go'
    ORDER BY plans.mau
    LIMIT 1
  );
END;
$$;

ALTER FUNCTION public.find_best_plan_v3 (
  bigint,
  double precision,
  double precision,
  bigint
) OWNER TO "postgres";

-- Update is_good_plan_v5_org
DROP FUNCTION IF EXISTS public.is_good_plan_v5_org (uuid);

CREATE FUNCTION public.is_good_plan_v5_org (orgid uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE total_metrics RECORD; current_plan_name TEXT;
BEGIN
  SELECT * INTO total_metrics FROM public.get_total_metrics(orgid,
    (SELECT subscription_anchor_start::date FROM public.stripe_info si
     INNER JOIN public.orgs o ON o.customer_id = si.customer_id WHERE o.id = orgid),
    (SELECT subscription_anchor_end::date FROM public.stripe_info si
     INNER JOIN public.orgs o ON o.customer_id = si.customer_id WHERE o.id = orgid));
  
  current_plan_name := (SELECT public.get_current_plan_name_org(orgid));
  
  RETURN EXISTS (SELECT 1 FROM public.find_fit_plan_v3(total_metrics.mau, total_metrics.bandwidth,
      total_metrics.storage, total_metrics.build_time_seconds)
    WHERE find_fit_plan_v3.name = current_plan_name);
END;
$$;

-- Update is_paying_and_good_plan_org_action
CREATE OR REPLACE FUNCTION public.is_paying_and_good_plan_org_action (orgid uuid, actions public.action_type[]) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE org_customer_id text; result boolean;
BEGIN
  SELECT o.customer_id INTO org_customer_id FROM public.orgs o WHERE o.id = orgid;
  SELECT (si.trial_at > now()) OR (si.status = 'succeeded' AND NOT (
      (si.mau_exceeded AND 'mau' = ANY(actions)) OR (si.storage_exceeded AND 'storage' = ANY(actions)) OR
      (si.bandwidth_exceeded AND 'bandwidth' = ANY(actions)) OR (si.build_time_exceeded AND 'build_time' = ANY(actions))))
  INTO result FROM public.stripe_info si WHERE si.customer_id = org_customer_id LIMIT 1;
  RETURN COALESCE(result, false);
END;
$$;

GRANT ALL ON FUNCTION public.is_paying_and_good_plan_org_action (uuid, public.action_type[]) TO anon,
authenticated,
service_role;

-- Update get_current_plan_max_org to include build_time_seconds
DROP FUNCTION IF EXISTS public.get_current_plan_max_org (uuid);

CREATE FUNCTION public.get_current_plan_max_org (orgid uuid) RETURNS TABLE (
  mau bigint,
  bandwidth bigint,
  storage bigint,
  build_time_seconds bigint
) LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
Begin
  RETURN QUERY
  (SELECT plans.mau, plans.bandwidth, plans.storage, plans.build_time_seconds
  FROM public.plans
    WHERE stripe_id=(
      SELECT product_id
      FROM public.stripe_info
      where customer_id=(
        SELECT customer_id
        FROM public.orgs
        where id=orgid)
  ));
End;
$$;

-- Update get_plan_usage_percent_detailed
DROP FUNCTION IF EXISTS public.get_plan_usage_percent_detailed (uuid);

DROP FUNCTION IF EXISTS public.get_plan_usage_percent_detailed (uuid, date, date);

CREATE FUNCTION public.get_plan_usage_percent_detailed (orgid uuid) RETURNS TABLE (
  total_percent double precision,
  mau_percent double precision,
  bandwidth_percent double precision,
  storage_percent double precision,
  build_time_percent double precision
) LANGUAGE plpgsql
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE current_plan_max RECORD; total_stats RECORD;
  percent_mau double precision; percent_bandwidth double precision; percent_storage double precision; percent_build_time double precision;
BEGIN
  SELECT * INTO current_plan_max FROM public.get_current_plan_max_org(orgid);
  SELECT * INTO total_stats FROM public.get_total_metrics(orgid);
  percent_mau := public.convert_number_to_percent(total_stats.mau, current_plan_max.mau);
  percent_bandwidth := public.convert_number_to_percent(total_stats.bandwidth, current_plan_max.bandwidth);
  percent_storage := public.convert_number_to_percent(total_stats.storage, current_plan_max.storage);
  percent_build_time := public.convert_number_to_percent(total_stats.build_time_seconds, current_plan_max.build_time_seconds);
  RETURN QUERY SELECT GREATEST(percent_mau, percent_bandwidth, percent_storage, percent_build_time),
    percent_mau, percent_bandwidth, percent_storage, percent_build_time;
END;
$$;

CREATE FUNCTION public.get_plan_usage_percent_detailed (orgid uuid, cycle_start date, cycle_end date) RETURNS TABLE (
  total_percent double precision,
  mau_percent double precision,
  bandwidth_percent double precision,
  storage_percent double precision,
  build_time_percent double precision
) LANGUAGE plpgsql
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE current_plan_max RECORD; total_stats RECORD;
  percent_mau double precision; percent_bandwidth double precision; percent_storage double precision; percent_build_time double precision;
BEGIN
  SELECT * INTO current_plan_max FROM public.get_current_plan_max_org(orgid);
  SELECT * INTO total_stats FROM public.get_total_metrics(orgid, cycle_start, cycle_end);
  percent_mau := public.convert_number_to_percent(total_stats.mau, current_plan_max.mau);
  percent_bandwidth := public.convert_number_to_percent(total_stats.bandwidth, current_plan_max.bandwidth);
  percent_storage := public.convert_number_to_percent(total_stats.storage, current_plan_max.storage);
  percent_build_time := public.convert_number_to_percent(total_stats.build_time_seconds, current_plan_max.build_time_seconds);
  RETURN QUERY SELECT GREATEST(percent_mau, percent_bandwidth, percent_storage, percent_build_time),
    percent_mau, percent_bandwidth, percent_storage, percent_build_time;
END;
$$;

-- ==================================================
-- PART 5: UPDATE CACHE FUNCTIONS TO INCLUDE BUILD_TIME_SECONDS
-- ==================================================
-- The seed_get_app_metrics_caches function caches metrics data in JSONB format
-- It needs to include build_time_seconds in the cached data structure
CREATE OR REPLACE FUNCTION public.seed_get_app_metrics_caches(
    p_org_id uuid, p_start_date date, p_end_date date
) RETURNS public.app_metrics_cache LANGUAGE plpgsql SECURITY DEFINER
SET
search_path TO '' AS $function$
DECLARE
    metrics_json jsonb;
    cache_record public.app_metrics_cache%ROWTYPE;
BEGIN
    WITH DateSeries AS (
        SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::date AS date
    ),
    all_apps AS (
        SELECT apps.app_id, apps.owner_org
        FROM public.apps
        WHERE apps.owner_org = p_org_id
        UNION
        SELECT deleted_apps.app_id, deleted_apps.owner_org
        FROM public.deleted_apps
        WHERE deleted_apps.owner_org = p_org_id
    ),
    deleted_metrics AS (
        SELECT
            deleted_apps.app_id,
            deleted_apps.deleted_at::date AS date,
            COUNT(*) AS deleted_count
        FROM public.deleted_apps
        WHERE deleted_apps.owner_org = p_org_id
        AND deleted_apps.deleted_at::date BETWEEN p_start_date AND p_end_date
        GROUP BY deleted_apps.app_id, deleted_apps.deleted_at::date
    ),
    metrics AS (
        SELECT
            aa.app_id,
            ds.date::date,
            COALESCE(dm.mau, 0) AS mau,
            COALESCE(dst.storage, 0) AS storage,
            COALESCE(db.bandwidth, 0) AS bandwidth,
            COALESCE(dbt.build_time_seconds, 0) AS build_time_seconds,
            COALESCE(SUM(dv.get)::bigint, 0) AS get,
            COALESCE(SUM(dv.fail)::bigint, 0) AS fail,
            COALESCE(SUM(dv.install)::bigint, 0) AS install,
            COALESCE(SUM(dv.uninstall)::bigint, 0) AS uninstall
        FROM
            all_apps aa
        CROSS JOIN
            DateSeries ds
        LEFT JOIN
            public.daily_mau dm ON aa.app_id = dm.app_id AND ds.date = dm.date
        LEFT JOIN
            public.daily_storage dst ON aa.app_id = dst.app_id AND ds.date = dst.date
        LEFT JOIN
            public.daily_bandwidth db ON aa.app_id = db.app_id AND ds.date = db.date
        LEFT JOIN
            public.daily_build_time dbt ON aa.app_id = dbt.app_id AND ds.date = dbt.date
        LEFT JOIN
            public.daily_version dv ON aa.app_id = dv.app_id AND ds.date = dv.date
        LEFT JOIN
            deleted_metrics del ON aa.app_id = del.app_id AND ds.date = del.date
        GROUP BY
            aa.app_id, ds.date, dm.mau, dst.storage, db.bandwidth, dbt.build_time_seconds, del.deleted_count
    )
    SELECT COALESCE(
        jsonb_agg(row_to_json(metrics) ORDER BY metrics.app_id, metrics.date),
        '[]'::jsonb
    )
    INTO metrics_json
    FROM metrics;

    INSERT INTO public.app_metrics_cache (org_id, start_date, end_date, response, cached_at)
    VALUES (p_org_id, p_start_date, p_end_date, metrics_json, clock_timestamp())
    ON CONFLICT (org_id) DO UPDATE
        SET start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            response = EXCLUDED.response,
            cached_at = EXCLUDED.cached_at
    RETURNING * INTO cache_record;

    RETURN cache_record;
END;
$function$;

-- Update get_app_metrics to properly extract build_time_seconds from cache
DROP FUNCTION IF EXISTS public.get_app_metrics(uuid, date, date);

CREATE FUNCTION public.get_app_metrics(
    org_id uuid, start_date date, end_date date
) RETURNS TABLE (
    app_id character varying,
    date date,
    mau bigint,
    storage bigint,
    bandwidth bigint,
    build_time_seconds bigint,
    get bigint,
    fail bigint,
    install bigint,
    uninstall bigint
) LANGUAGE plpgsql SECURITY DEFINER
SET
search_path TO '' AS $function$
DECLARE
    cache_entry public.app_metrics_cache%ROWTYPE;
    org_exists boolean;
BEGIN
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
        metrics.build_time_seconds,
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
        build_time_seconds bigint,
        get bigint,
        fail bigint,
        install bigint,
        uninstall bigint
    )
    ORDER BY metrics.app_id, metrics.date;
END;
$function$;

COMMIT;
