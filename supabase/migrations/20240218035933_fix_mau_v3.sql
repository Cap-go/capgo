CREATE OR REPLACE FUNCTION public.get_total_stats_v4(userid uuid)
RETURNS TABLE(mau bigint, bandwidth double precision, storage double precision)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    anchor_start date;
    anchor_end date;
    apps text;
BEGIN
    SELECT subscription_anchor_start, subscription_anchor_end INTO anchor_start, anchor_end
    FROM stripe_info
    WHERE customer_id=(SELECT customer_id from users where id=userid);

    select (SELECT json_agg(app_id) from apps where user_id=userid)::text into apps;

    -- Use the app_ids variable in the query
    RETURN QUERY 
    SELECT 
        COALESCE(SUM(raw_data.mau), 0)::bigint as mau,
        COALESCE(ROUND(convert_bytes_to_gb(SUM(raw_data.bandwidth))::numeric,2), 0)::float AS bandwidth,
        COALESCE(ROUND(convert_bytes_to_gb(SUM(raw_data.storage_added - raw_data.storage_deleted))::numeric,2), 0)::float AS storage
    FROM (
    SELECT app_id,
        COALESCE(MAX(clickhouse_app_usage_parm.mau), 0) as mau,
        COALESCE(SUM(clickhouse_app_usage_parm.bandwidth), 0) as bandwidth,
        COALESCE(SUM(clickhouse_app_usage_parm.storage_added), 0) as storage_added,
        COALESCE(SUM(clickhouse_app_usage_parm.storage_deleted), 0) as storage_deleted
        FROM clickhouse_app_usage_parm
        WHERE _app_list=apps
        AND _start_date=anchor_start
        AND _end_date=anchor_end
        GROUP BY app_id
    ) AS raw_data;
END;  
$$;