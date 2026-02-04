-- Add org-level metrics cache and combine plan usage + fit calculation

CREATE TABLE IF NOT EXISTS public.org_metrics_cache (
    org_id uuid PRIMARY KEY REFERENCES public.orgs (id),
    start_date date NOT NULL,
    end_date date NOT NULL,
    mau bigint NOT NULL,
    storage bigint NOT NULL,
    bandwidth bigint NOT NULL,
    build_time_unit bigint NOT NULL,
    get bigint NOT NULL,
    fail bigint NOT NULL,
    install bigint NOT NULL,
    uninstall bigint NOT NULL,
    cached_at timestamp with time zone NOT NULL DEFAULT NOW()
);

ALTER TABLE public.org_metrics_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all" ON public.org_metrics_cache FOR ALL USING (false)
WITH
CHECK (false);

CREATE OR REPLACE FUNCTION public.seed_org_metrics_cache(
    p_org_id uuid,
    p_start_date date,
    p_end_date date
) RETURNS public.org_metrics_cache LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
    v_mau bigint;
    v_storage bigint;
    v_bandwidth bigint;
    v_build_time bigint;
    v_get bigint;
    v_fail bigint;
    v_install bigint;
    v_uninstall bigint;
    cache_record public.org_metrics_cache%ROWTYPE;
BEGIN
    WITH app_ids AS (
        SELECT apps.app_id
        FROM public.apps
        WHERE apps.owner_org = p_org_id
        UNION
        SELECT deleted_apps.app_id
        FROM public.deleted_apps
        WHERE deleted_apps.owner_org = p_org_id
    ),
    mau AS (
        SELECT COALESCE(SUM(dm.mau), 0)::bigint AS value
        FROM public.daily_mau dm
        JOIN app_ids a ON a.app_id = dm.app_id
        WHERE dm.date BETWEEN p_start_date AND p_end_date
    ),
    bandwidth AS (
        SELECT COALESCE(SUM(db.bandwidth), 0)::bigint AS value
        FROM public.daily_bandwidth db
        JOIN app_ids a ON a.app_id = db.app_id
        WHERE db.date BETWEEN p_start_date AND p_end_date
    ),
    build_time AS (
        SELECT COALESCE(SUM(dbt.build_time_unit), 0)::bigint AS value
        FROM public.daily_build_time dbt
        JOIN app_ids a ON a.app_id = dbt.app_id
        WHERE dbt.date BETWEEN p_start_date AND p_end_date
    ),
    version_stats AS (
        SELECT
            COALESCE(SUM(dv.get), 0)::bigint AS get,
            COALESCE(SUM(dv.fail), 0)::bigint AS fail,
            COALESCE(SUM(dv.install), 0)::bigint AS install,
            COALESCE(SUM(dv.uninstall), 0)::bigint AS uninstall
        FROM public.daily_version dv
        JOIN app_ids a ON a.app_id = dv.app_id
        WHERE dv.date BETWEEN p_start_date AND p_end_date
    ),
    storage AS (
        SELECT COALESCE(SUM(avm.size), 0)::bigint AS value
        FROM public.app_versions av
        INNER JOIN public.app_versions_meta avm ON av.id = avm.id
        WHERE av.owner_org = p_org_id AND av.deleted = false
    )
    SELECT
        mau.value,
        storage.value,
        bandwidth.value,
        build_time.value,
        version_stats.get,
        version_stats.fail,
        version_stats.install,
        version_stats.uninstall
    INTO v_mau, v_storage, v_bandwidth, v_build_time, v_get, v_fail, v_install, v_uninstall
    FROM mau, storage, bandwidth, build_time, version_stats;

    INSERT INTO public.org_metrics_cache (
        org_id,
        start_date,
        end_date,
        mau,
        storage,
        bandwidth,
        build_time_unit,
        get,
        fail,
        install,
        uninstall,
        cached_at
    )
    VALUES (
        p_org_id,
        p_start_date,
        p_end_date,
        v_mau,
        v_storage,
        v_bandwidth,
        v_build_time,
        v_get,
        v_fail,
        v_install,
        v_uninstall,
        clock_timestamp()
    )
    ON CONFLICT (org_id) DO UPDATE
        SET start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            mau = EXCLUDED.mau,
            storage = EXCLUDED.storage,
            bandwidth = EXCLUDED.bandwidth,
            build_time_unit = EXCLUDED.build_time_unit,
            get = EXCLUDED.get,
            fail = EXCLUDED.fail,
            install = EXCLUDED.install,
            uninstall = EXCLUDED.uninstall,
            cached_at = EXCLUDED.cached_at
    RETURNING * INTO cache_record;

    RETURN cache_record;
END;
$function$;

ALTER FUNCTION public.seed_org_metrics_cache(uuid, date, date) OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.seed_org_metrics_cache(uuid, date, date) FROM public;
REVOKE ALL ON FUNCTION public.seed_org_metrics_cache(uuid, date, date) FROM anon;
REVOKE ALL ON FUNCTION public.seed_org_metrics_cache(uuid, date, date) FROM authenticated;
REVOKE ALL ON FUNCTION public.seed_org_metrics_cache(uuid, date, date) FROM service_role;

-- Cached get_total_metrics implementation
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

GRANT ALL ON FUNCTION public.get_total_metrics(uuid, date, date) TO service_role;
REVOKE ALL ON FUNCTION public.get_total_metrics(uuid, date, date) FROM anon;
REVOKE ALL ON FUNCTION public.get_total_metrics(uuid, date, date) FROM authenticated;

-- Keep 1-arg get_total_metrics in sync with new column list
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
    WHERE o.id = org_id;

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

GRANT ALL ON FUNCTION public.get_total_metrics(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_total_metrics(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_total_metrics(uuid) FROM authenticated;

-- Combined usage + plan fit (single get_total_metrics call)
CREATE FUNCTION public.get_plan_usage_and_fit(orgid uuid)
RETURNS TABLE (
    is_good_plan boolean,
    total_percent double precision,
    mau_percent double precision,
    bandwidth_percent double precision,
    storage_percent double precision,
    build_time_percent double precision
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
    v_start_date date;
    v_end_date date;
    v_plan_mau bigint;
    v_plan_bandwidth bigint;
    v_plan_storage bigint;
    v_plan_build_time bigint;
    v_anchor_day interval;
    v_plan_name text;
    total_stats RECORD;
    percent_mau double precision;
    percent_bandwidth double precision;
    percent_storage double precision;
    percent_build_time double precision;
    v_is_good_plan boolean;
BEGIN
    SELECT
        COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL),
        p.mau,
        p.bandwidth,
        p.storage,
        p.build_time_unit,
        p.name
    INTO v_anchor_day, v_plan_mau, v_plan_bandwidth, v_plan_storage, v_plan_build_time, v_plan_name
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

    IF v_plan_name = 'Enterprise' THEN
        v_is_good_plan := TRUE;
    ELSIF v_plan_name IS NULL THEN
        v_is_good_plan := FALSE;
    ELSE
        v_is_good_plan := v_plan_mau >= total_stats.mau
            AND v_plan_bandwidth >= total_stats.bandwidth
            AND v_plan_storage >= total_stats.storage
            AND v_plan_build_time >= COALESCE(total_stats.build_time_unit, 0);
    END IF;

    RETURN QUERY SELECT
        v_is_good_plan,
        GREATEST(percent_mau, percent_bandwidth, percent_storage, percent_build_time),
        percent_mau,
        percent_bandwidth,
        percent_storage,
        percent_build_time;
END;
$function$;

ALTER FUNCTION public.get_plan_usage_and_fit(uuid) OWNER TO "postgres";

GRANT ALL ON FUNCTION public.get_plan_usage_and_fit(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_plan_usage_and_fit(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_plan_usage_and_fit(uuid) FROM authenticated;
