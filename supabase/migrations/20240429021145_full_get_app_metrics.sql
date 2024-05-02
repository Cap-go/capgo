DROP FUNCTION IF EXISTS get_app_metrics(uuid, date, date);
CREATE OR REPLACE FUNCTION get_app_metrics(
    org_id uuid,
    start_date date,
    end_date date
)
RETURNS TABLE (
    app_id character varying,
    date date,
    mau bigint,
    storage bigint,
    bandwidth bigint,
    get bigint,
    fail bigint,
    install bigint,
    uninstall bigint
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.app_id,
        d.date::date,
        COALESCE(dm.mau, 0) AS mau,
        COALESCE(ds.storage, 0) AS storage,
        COALESCE(db.bandwidth, 0) AS bandwidth,
        COALESCE(SUM(dv.get)::bigint, 0) AS get,
        COALESCE(SUM(dv.fail)::bigint, 0) AS fail,
        COALESCE(SUM(dv.install)::bigint, 0) AS install,
        COALESCE(SUM(dv.uninstall)::bigint, 0) AS uninstall
    FROM
        apps a
    CROSS JOIN
        generate_series(start_date, end_date, '1 day'::interval) AS d(date)
    LEFT JOIN
        daily_mau dm ON a.app_id = dm.app_id AND d.date::date = dm.date
    LEFT JOIN
        daily_storage ds ON a.app_id = ds.app_id AND d.date::date = ds.date
    LEFT JOIN
        daily_bandwidth db ON a.app_id = db.app_id AND d.date::date = db.date
    LEFT JOIN
        daily_version dv ON a.app_id = dv.app_id AND d.date::date = dv.date
    WHERE
        a.owner_org = org_id
    GROUP BY
        a.app_id, d.date, dm.mau, ds.storage, db.bandwidth;
END;
$$;

DROP FUNCTION IF EXISTS get_app_metrics(uuid);
CREATE OR REPLACE FUNCTION public.get_app_metrics(org_id uuid)
 RETURNS TABLE(app_id character varying, date date, mau bigint, storage bigint, bandwidth bigint, get bigint, fail bigint, install bigint, uninstall bigint)
 LANGUAGE plpgsql
AS $function$
DECLARE
    cycle_start timestamp with time zone;
    cycle_end timestamp with time zone;
BEGIN
    SELECT subscription_anchor_start, subscription_anchor_end 
    INTO cycle_start, cycle_end
    FROM get_cycle_info_org(org_id);
    
    RETURN QUERY
    SELECT * FROM get_app_metrics(org_id, cycle_start::date, cycle_end::date);
END;
$function$;


DROP FUNCTION IF EXISTS get_global_metrics(uuid, date, date);
CREATE OR REPLACE FUNCTION public.get_global_metrics(org_id uuid, start_date date, end_date date)
 RETURNS TABLE(date date, mau bigint, storage bigint, bandwidth bigint, get bigint, fail bigint, install bigint, uninstall bigint)
 LANGUAGE plpgsql
AS $function$
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
        get_app_metrics(org_id, start_date, end_date) AS metrics
    GROUP BY
        metrics.date
    ORDER BY
        metrics.date;
END;
$function$;
DROP FUNCTION IF EXISTS get_global_metrics(uuid);
CREATE OR REPLACE FUNCTION public.get_global_metrics(org_id uuid)
 RETURNS TABLE(date date, mau bigint, storage bigint, bandwidth bigint, get bigint, fail bigint, install bigint, uninstall bigint)
 LANGUAGE plpgsql
AS $function$
DECLARE
    cycle_start timestamp with time zone;
    cycle_end timestamp with time zone;
BEGIN
    SELECT subscription_anchor_start, subscription_anchor_end 
    INTO cycle_start, cycle_end
    FROM get_cycle_info_org(org_id);
    
    RETURN QUERY
    SELECT * FROM get_global_metrics(org_id, cycle_start::date, cycle_end::date);
END;
$function$;


DROP FUNCTION IF EXISTS get_total_metrics(uuid, date, date);
CREATE OR REPLACE FUNCTION public.get_total_metrics(org_id uuid, start_date date, end_date date)
 RETURNS TABLE(mau bigint, storage bigint, bandwidth bigint, get bigint, fail bigint, install bigint, uninstall bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        SUM(metrics.mau)::bigint AS mau,
        get_total_storage_size_org(org_id)::bigint AS storage,
        SUM(metrics.bandwidth)::bigint AS bandwidth,
        SUM(metrics.get)::bigint AS get,
        SUM(metrics.fail)::bigint AS fail,
        SUM(metrics.install)::bigint AS install,
        SUM(metrics.uninstall)::bigint AS uninstall
    FROM
        get_app_metrics(org_id, start_date, end_date) AS metrics;
END;
$function$;
DROP FUNCTION IF EXISTS get_total_metrics(uuid);
CREATE OR REPLACE FUNCTION public.get_total_metrics(org_id uuid)
 RETURNS TABLE(mau bigint, storage bigint, bandwidth bigint, get bigint, fail bigint, install bigint, uninstall bigint)
 LANGUAGE plpgsql
AS $function$
DECLARE
    cycle_start timestamp with time zone;
    cycle_end timestamp with time zone;
BEGIN
    SELECT subscription_anchor_start, subscription_anchor_end 
    INTO cycle_start, cycle_end
    FROM get_cycle_info_org(org_id);
    
    RETURN QUERY
    SELECT * FROM get_total_metrics(org_id, cycle_start::date, cycle_end::date);
END;
$function$;
