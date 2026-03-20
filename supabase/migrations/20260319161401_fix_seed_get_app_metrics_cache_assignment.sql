CREATE OR REPLACE FUNCTION public.seed_get_app_metrics_caches(
    p_org_id uuid, p_start_date date, p_end_date date
) RETURNS public.app_metrics_cache
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
            COALESCE(dbt.build_time_unit, 0) AS build_time_unit,
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
            aa.app_id, ds.date, dm.mau, dst.storage, db.bandwidth, dbt.build_time_unit, del.deleted_count
    )
    SELECT COALESCE(
        jsonb_agg(row_to_json(metrics) ORDER BY metrics.app_id, metrics.date),
        '[]'::jsonb
    )
    INTO metrics_json
    FROM metrics;

    BEGIN
        INSERT INTO public.app_metrics_cache (org_id, start_date, end_date, response, cached_at)
        VALUES (p_org_id, p_start_date, p_end_date, metrics_json, clock_timestamp())
        ON CONFLICT (org_id) DO UPDATE
            SET start_date = EXCLUDED.start_date,
                end_date = EXCLUDED.end_date,
                response = EXCLUDED.response,
                cached_at = EXCLUDED.cached_at
        RETURNING * INTO cache_record;
    EXCEPTION
        WHEN read_only_sql_transaction THEN
            cache_record := ROW(
                0::bigint,
                p_org_id,
                p_start_date,
                p_end_date,
                metrics_json,
                clock_timestamp()
            )::public.app_metrics_cache;
    END;

    RETURN cache_record;
END;
$function$;

ALTER FUNCTION public.seed_get_app_metrics_caches(uuid, date, date) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.seed_org_metrics_cache(
    p_org_id uuid, p_start_date date, p_end_date date
) RETURNS public.org_metrics_cache
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
    EXCEPTION
        WHEN read_only_sql_transaction THEN
            cache_record := ROW(
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
            )::public.org_metrics_cache;
    END;

    RETURN cache_record;
END;
$function$;

ALTER FUNCTION public.seed_org_metrics_cache(uuid, date, date) OWNER TO postgres;
