ALTER TABLE daily_mau
ALTER COLUMN mau TYPE bigint;

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
    bandwidth bigint
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
        COALESCE(db.bandwidth, 0) AS bandwidth
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
    WHERE
        a.owner_org = org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_app_metrics(org_id uuid)
 RETURNS TABLE(app_id character varying, date date, mau bigint, storage bigint, bandwidth bigint)
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


CREATE OR REPLACE FUNCTION public.get_global_metrics(org_id uuid, start_date date, end_date date)
 RETURNS TABLE(date date, mau bigint, storage bigint, bandwidth bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        metrics.date,
        SUM(metrics.mau)::bigint AS mau,
        SUM(metrics.storage)::bigint AS storage,
        SUM(metrics.bandwidth)::bigint AS bandwidth
    FROM
        get_app_metrics(org_id, start_date, end_date) AS metrics
    GROUP BY
        metrics.date
    ORDER BY
        metrics.date;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_global_metrics(org_id uuid)
 RETURNS TABLE(date date, mau bigint, storage bigint, bandwidth bigint)
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


CREATE OR REPLACE FUNCTION public.get_total_metrics(org_id uuid, start_date date, end_date date)
 RETURNS TABLE(mau bigint, storage bigint, bandwidth bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        SUM(metrics.mau)::bigint AS mau,
        get_total_storage_size_org(org_id)::bigint AS storage,
        SUM(metrics.bandwidth)::bigint AS bandwidth
    FROM
        get_app_metrics(org_id, start_date, end_date) AS metrics;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_total_metrics(org_id uuid)
 RETURNS TABLE(mau bigint, storage bigint, bandwidth bigint)
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

ALTER TABLE "public"."plans"
    DROP COLUMN "app",
    DROP COLUMN "channel",
    DROP COLUMN "update",
    DROP COLUMN "shared",
    DROP COLUMN "abtest",
    DROP COLUMN "progressive_deploy";

UPDATE "public"."plans"
SET
    "storage" = "storage" * 1024 * 1024 * 1024,
    "bandwidth" = "bandwidth" * 1024 * 1024 * 1024;

ALTER TABLE "public"."plans"
    ALTER COLUMN "storage" TYPE bigint,
    ALTER COLUMN "bandwidth" TYPE bigint,
    ALTER COLUMN "mau" TYPE bigint;

