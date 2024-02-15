-- See this issue https://github.com/supabase/wrappers/issues/236 for further info about this.
CREATE OR REPLACE FUNCTION public.get_total_stats_v4(userid uuid)
RETURNS TABLE(mau bigint, bandwidth double precision, storage double precision)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    anchor_start date;
    anchor_end date;
    app_ids text[];
    usage_table_name text;
BEGIN
    SELECT subscription_anchor_start, subscription_anchor_end INTO anchor_start, anchor_end
    FROM stripe_info
    WHERE customer_id=(SELECT customer_id from users where id=userid);

    -- Retrieve the app_ids into the variable
    SELECT array_agg(app_id) INTO app_ids FROM apps WHERE user_id=userid;

    -- Use the app_ids variable in the query
    RETURN QUERY SELECT 
            COALESCE(MAX(clickhouse_app_usage.mau), 0)::bigint AS mau,
            COALESCE(round(convert_bytes_to_gb(SUM(clickhouse_app_usage.bandwidth))::numeric,2), 0)::float AS bandwidth,
            COALESCE(round(convert_bytes_to_gb(SUM(clickhouse_app_usage.storage_added - clickhouse_app_usage.storage_deleted))::numeric,2), 0)::float AS storage
        FROM clickhouse_app_usage
        WHERE app_id = any(app_ids)
        AND date >= anchor_start
        AND date <= anchor_end
        LIMIT 1;
END;  
$$;