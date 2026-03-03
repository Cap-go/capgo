-- Fix org authorization checks for metrics RPCs to prevent cross-tenant disclosure
-- Keeps current execution model while enforcing explicit read permission checks.

CREATE OR REPLACE FUNCTION public.get_app_metrics(
    p_org_id uuid
) RETURNS TABLE (
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
) LANGUAGE plpgsql
SET
search_path = '' AS $function$
DECLARE
    cycle_start timestamp with time zone;
    cycle_end timestamp with time zone;
BEGIN
    SELECT subscription_anchor_start, subscription_anchor_end
    INTO cycle_start, cycle_end
    FROM public.get_cycle_info_org(p_org_id);

    RETURN QUERY
    SELECT * FROM public.get_app_metrics(p_org_id, cycle_start::date, cycle_end::date);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_app_metrics(
    p_org_id uuid,
    p_start_date date,
    p_end_date date
) RETURNS TABLE (
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
) LANGUAGE plpgsql SECURITY DEFINER
SET
search_path = '' AS $function$
DECLARE
    cache_entry public.app_metrics_cache%ROWTYPE;
    org_exists boolean;
    v_user_id uuid;
    v_is_service_role boolean;
BEGIN
    v_is_service_role := ((SELECT auth.jwt() ->> 'role') = 'service_role') OR ((SELECT session_user) IS NOT DISTINCT FROM 'postgres');

    IF NOT v_is_service_role THEN
        v_user_id := public.get_identity('{read,upload,write,all}'::public.key_mode[]);

        IF v_user_id IS NULL OR NOT public.check_min_rights(
            'read'::public.user_min_right,
            v_user_id,
            p_org_id,
            NULL::character varying,
            NULL::bigint
        ) THEN
            PERFORM public.pg_log('deny: NO_RIGHTS', jsonb_build_object('org_id', p_org_id, 'uid', v_user_id, 'rpc', 'get_app_metrics'));
            RETURN;
        END IF;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.orgs WHERE id = p_org_id
    ) INTO org_exists;

    IF NOT org_exists THEN
        RETURN;
    END IF;

    SELECT *
    INTO cache_entry
    FROM public.app_metrics_cache
    WHERE org_id = p_org_id;

    IF cache_entry.id IS NULL
        OR cache_entry.start_date IS DISTINCT FROM p_start_date
        OR cache_entry.end_date IS DISTINCT FROM p_end_date
        OR cache_entry.cached_at IS NULL
        OR cache_entry.cached_at < (now() - interval '5 minutes') THEN
        cache_entry := public.seed_get_app_metrics_caches(p_org_id, p_start_date, p_end_date);
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
$function$;

CREATE OR REPLACE FUNCTION public.get_global_metrics(
    p_org_id uuid
) RETURNS TABLE (
    date date,
    mau bigint,
    storage bigint,
    bandwidth bigint,
    get bigint,
    fail bigint,
    install bigint,
    uninstall bigint
) LANGUAGE plpgsql
SET
search_path = '' AS $function$
DECLARE
    cycle_start timestamp with time zone;
    cycle_end timestamp with time zone;
BEGIN
    SELECT subscription_anchor_start, subscription_anchor_end
    INTO cycle_start, cycle_end
    FROM public.get_cycle_info_org(p_org_id);

    RETURN QUERY
    SELECT * FROM public.get_global_metrics(p_org_id, cycle_start::date, cycle_end::date);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_global_metrics(
    p_org_id uuid,
    p_start_date date,
    p_end_date date
) RETURNS TABLE (
    date date,
    mau bigint,
    storage bigint,
    bandwidth bigint,
    get bigint,
    fail bigint,
    install bigint,
    uninstall bigint
) LANGUAGE plpgsql
SET
search_path = '' AS $function$
BEGIN
    RETURN QUERY
    SELECT
        metrics.date,
        SUM(metrics.mau)::bigint AS mau,
        SUM(metrics.storage)::bigint AS storage,
        SUM(metrics.bandwidth)::bigint AS bandwidth,
        SUM(metrics.get)::bigint AS get,
        SUM(metrics.fail)::bigint AS fail,
        SUM(metrics.install)::bigint AS install,
        SUM(metrics.uninstall)::bigint AS uninstall
    FROM
        public.get_app_metrics(p_org_id, p_start_date, p_end_date) AS metrics
    GROUP BY
        metrics.date
    ORDER BY
        metrics.date;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_total_metrics(
    p_org_id uuid,
    p_start_date date,
    p_end_date date
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
    v_user_id uuid;
    v_is_service_role boolean;
BEGIN
    v_is_service_role := ((SELECT auth.jwt() ->> 'role') = 'service_role') OR ((SELECT session_user) IS NOT DISTINCT FROM 'postgres');

    IF NOT v_is_service_role THEN
        v_user_id := public.get_identity('{read,upload,write,all}'::public.key_mode[]);

        IF v_user_id IS NULL OR NOT public.check_min_rights(
            'read'::public.user_min_right,
            v_user_id,
            p_org_id,
            NULL::character varying,
            NULL::bigint
        ) THEN
            PERFORM public.pg_log('deny: NO_RIGHTS', jsonb_build_object('org_id', p_org_id, 'uid', v_user_id, 'rpc', 'get_total_metrics'));
            RETURN;
        END IF;
    END IF;

    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.orgs
        WHERE orgs.id = p_org_id
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
        cache_entry := public.seed_org_metrics_cache(p_org_id, p_start_date, p_end_date);

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
    WHERE org_metrics_cache.org_id = p_org_id;

    IF FOUND
        AND cache_entry.start_date = p_start_date
        AND cache_entry.end_date = p_end_date
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

    cache_entry := public.seed_org_metrics_cache(p_org_id, p_start_date, p_end_date);

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

CREATE OR REPLACE FUNCTION public.get_total_metrics(
    org_id uuid
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
    v_start_date date;
    v_end_date date;
    v_anchor_day interval;
BEGIN
    SELECT
        COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::interval)
    INTO v_anchor_day
    FROM public.orgs o
    LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
    WHERE o.id = get_total_metrics.org_id;

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
