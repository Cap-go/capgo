CREATE OR REPLACE FUNCTION public.get_total_stats_v4(userid uuid)
RETURNS TABLE(mau bigint, bandwidth double precision, storage double precision)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    anchor_start date;
    anchor_end date;
    usage_table_name text;
BEGIN
    SELECT subscription_anchor_start, subscription_anchor_end INTO anchor_start, anchor_end
    FROM stripe_info
    WHERE customer_id=(SELECT customer_id from users where id=userid);

    RETURN QUERY SELECT 
            COALESCE(MAX(clickhouse_app_usage.mau), 0)::bigint AS mau,
            COALESCE(round(convert_bytes_to_gb(SUM(clickhouse_app_usage.bandwidth))::numeric,2), 0)::float AS bandwidth,
            COALESCE(round(convert_bytes_to_gb(SUM(clickhouse_app_usage.storage_added - clickhouse_app_usage.storage_deleted))::numeric,2), 0)::float AS storage
        FROM clickhouse_app_usage
        WHERE app_id IN (SELECT app_id from apps where user_id=get_total_stats_v4.userid)
        AND date >= anchor_start
        AND date <= anchor_end
        LIMIT 1;
END;  
$$;