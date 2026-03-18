-- Harden the org metrics cache helpers so they can be used inside read-only transactions.

CREATE OR REPLACE FUNCTION public.calculate_org_metrics_cache_entry(
    p_org_id uuid,
    p_start_date date,
    p_end_date date
) RETURNS public.org_metrics_cache LANGUAGE plpgsql VOLATILE SECURITY DEFINER
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

    cache_record.org_id := p_org_id;
    cache_record.start_date := p_start_date;
    cache_record.end_date := p_end_date;
    cache_record.mau := v_mau;
    cache_record.storage := v_storage;
    cache_record.bandwidth := v_bandwidth;
    cache_record.build_time_unit := v_build_time;
    cache_record.get := v_get;
    cache_record.fail := v_fail;
    cache_record.install := v_install;
    cache_record.uninstall := v_uninstall;
    cache_record.cached_at := clock_timestamp();

    RETURN cache_record;
END;
$function$;

ALTER FUNCTION public.calculate_org_metrics_cache_entry(uuid, date, date) OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.calculate_org_metrics_cache_entry(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calculate_org_metrics_cache_entry(uuid, date, date) FROM anon;
REVOKE ALL ON FUNCTION public.calculate_org_metrics_cache_entry(uuid, date, date) FROM authenticated;
REVOKE ALL ON FUNCTION public.calculate_org_metrics_cache_entry(uuid, date, date) FROM service_role;

CREATE OR REPLACE FUNCTION public.seed_org_metrics_cache(
    p_org_id uuid,
    p_start_date date,
    p_end_date date
) RETURNS public.org_metrics_cache LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
    cache_record public.org_metrics_cache%ROWTYPE;
BEGIN
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
    SELECT
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
    FROM public.calculate_org_metrics_cache_entry(p_org_id, p_start_date, p_end_date)
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

ALTER FUNCTION public.seed_org_metrics_cache(
    uuid, date, date
) OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.seed_org_metrics_cache(
    uuid, date, date
) FROM public;
REVOKE ALL ON FUNCTION public.seed_org_metrics_cache(
    uuid, date, date
) FROM anon;
REVOKE ALL ON FUNCTION public.seed_org_metrics_cache(
    uuid, date, date
) FROM authenticated;
REVOKE ALL ON FUNCTION public.seed_org_metrics_cache(
    uuid, date, date
) FROM service_role;

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
    tx_read_only boolean := current_setting('transaction_read_only') = 'on';
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

GRANT ALL ON FUNCTION public.get_total_metrics(
    uuid, date, date
) TO service_role;
REVOKE ALL ON FUNCTION public.get_total_metrics(uuid, date, date) FROM anon;
REVOKE ALL ON FUNCTION public.get_total_metrics(
    uuid, date, date
) FROM authenticated;
