-- Preserve read-only-safe metrics helpers and apply explicit PUBLIC revokes on
-- helper RPCs introduced before the current migration guardrails.

CREATE OR REPLACE FUNCTION public.get_total_metrics(
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
    tx_read_only boolean := COALESCE(current_setting('transaction_read_only', true), 'off') = 'on';
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
        IF tx_read_only THEN
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
            FROM public.calculate_org_metrics_cache_entry(org_id, start_date, end_date) AS metrics;
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

    IF tx_read_only THEN
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
        FROM public.calculate_org_metrics_cache_entry(org_id, start_date, end_date) AS metrics;
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

REVOKE ALL ON FUNCTION public.get_total_metrics(uuid, date, date) FROM public;
REVOKE ALL ON FUNCTION public.get_total_metrics(uuid, date, date) FROM anon;
REVOKE ALL ON FUNCTION public.get_total_metrics(
    uuid, date, date
) FROM authenticated;
GRANT ALL ON FUNCTION public.get_total_metrics(
    uuid, date, date
) TO service_role;

ALTER FUNCTION public.get_total_metrics(uuid) OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.get_total_metrics(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_total_metrics(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_total_metrics(uuid) FROM authenticated;
GRANT ALL ON FUNCTION public.get_total_metrics(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_plan_usage_and_fit(orgid uuid)
RETURNS TABLE (
    is_good_plan boolean,
    total_percent double precision,
    mau_percent double precision,
    bandwidth_percent double precision,
    storage_percent double precision,
    build_time_percent double precision
) LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
    v_start_date date;
    v_end_date date;
    v_plan_mau bigint;
    v_plan_bandwidth bigint;
    v_plan_storage bigint;
    v_plan_build_time bigint;
    v_anchor_day integer;
    v_current_month_start date;
    v_current_month_anchor date;
    v_target_month_start date;
    v_target_month_last_day date;
    v_next_target_month_start date;
    v_next_target_month_last_day date;
    v_plan_name text;
    total_stats RECORD;
    percent_mau double precision;
    percent_bandwidth double precision;
    percent_storage double precision;
    percent_build_time double precision;
    v_is_good_plan boolean;
BEGIN
    SELECT
        COALESCE(EXTRACT(DAY FROM si.subscription_anchor_start)::integer, 1),
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

    v_current_month_start := date_trunc('MONTH', NOW())::date;
    v_current_month_anchor := v_current_month_start + (
        LEAST(
            v_anchor_day,
            EXTRACT(DAY FROM (v_current_month_start + INTERVAL '1 MONTH - 1 day'))::integer
        ) - 1
    );

    IF NOW()::date < v_current_month_anchor THEN
        v_target_month_start := (v_current_month_start - INTERVAL '1 MONTH')::date;
    ELSE
        v_target_month_start := v_current_month_start;
    END IF;

    v_target_month_last_day := (v_target_month_start + INTERVAL '1 MONTH - 1 day')::date;
    v_start_date := v_target_month_start + (
        LEAST(v_anchor_day, EXTRACT(DAY FROM v_target_month_last_day)::integer) - 1
    );

    v_next_target_month_start := (v_target_month_start + INTERVAL '1 MONTH')::date;
    v_next_target_month_last_day := (v_next_target_month_start + INTERVAL '1 MONTH - 1 day')::date;
    v_end_date := v_next_target_month_start + (
        LEAST(v_anchor_day, EXTRACT(DAY FROM v_next_target_month_last_day)::integer) - 1
    );

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

REVOKE ALL ON FUNCTION public.get_plan_usage_and_fit(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_plan_usage_and_fit(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_plan_usage_and_fit(uuid) FROM authenticated;
GRANT ALL ON FUNCTION public.get_plan_usage_and_fit(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_plan_usage_and_fit_uncached(orgid uuid)
RETURNS TABLE (
    is_good_plan boolean,
    total_percent double precision,
    mau_percent double precision,
    bandwidth_percent double precision,
    storage_percent double precision,
    build_time_percent double precision
) LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
    v_start_date date;
    v_end_date date;
    v_plan_mau bigint;
    v_plan_bandwidth bigint;
    v_plan_storage bigint;
    v_plan_build_time bigint;
    v_anchor_day integer;
    v_current_month_start date;
    v_current_month_anchor date;
    v_target_month_start date;
    v_target_month_last_day date;
    v_next_target_month_start date;
    v_next_target_month_last_day date;
    v_plan_name text;
    total_stats RECORD;
    percent_mau double precision;
    percent_bandwidth double precision;
    percent_storage double precision;
    percent_build_time double precision;
    v_is_good_plan boolean;
BEGIN
    SELECT
        COALESCE(EXTRACT(DAY FROM si.subscription_anchor_start)::integer, 1),
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

    v_current_month_start := date_trunc('MONTH', NOW())::date;
    v_current_month_anchor := v_current_month_start + (
        LEAST(
            v_anchor_day,
            EXTRACT(DAY FROM (v_current_month_start + INTERVAL '1 MONTH - 1 day'))::integer
        ) - 1
    );

    IF NOW()::date < v_current_month_anchor THEN
        v_target_month_start := (v_current_month_start - INTERVAL '1 MONTH')::date;
    ELSE
        v_target_month_start := v_current_month_start;
    END IF;

    v_target_month_last_day := (v_target_month_start + INTERVAL '1 MONTH - 1 day')::date;
    v_start_date := v_target_month_start + (
        LEAST(v_anchor_day, EXTRACT(DAY FROM v_target_month_last_day)::integer) - 1
    );

    v_next_target_month_start := (v_target_month_start + INTERVAL '1 MONTH')::date;
    v_next_target_month_last_day := (v_next_target_month_start + INTERVAL '1 MONTH - 1 day')::date;
    v_end_date := v_next_target_month_start + (
        LEAST(v_anchor_day, EXTRACT(DAY FROM v_next_target_month_last_day)::integer) - 1
    );

    SELECT * INTO total_stats
    FROM public.seed_org_metrics_cache(orgid, v_start_date, v_end_date);

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

ALTER FUNCTION public.get_plan_usage_and_fit_uncached(uuid) OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.get_plan_usage_and_fit_uncached(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_plan_usage_and_fit_uncached(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_plan_usage_and_fit_uncached(
    uuid
) FROM authenticated;
GRANT ALL ON FUNCTION public.get_plan_usage_and_fit_uncached(
    uuid
) TO service_role;
