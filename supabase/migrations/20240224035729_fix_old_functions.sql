CREATE OR REPLACE FUNCTION "public"."find_best_plan_v3"("mau" bigint, "bandwidth" double precision, "storage" double precision) RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT name
  FROM plans
  WHERE plans.mau>=find_best_plan_v3.mau
    AND plans.storage>=find_best_plan_v3.storage
    AND plans.bandwidth>=find_best_plan_v3.bandwidth
    OR plans.name = 'Pay as you go'
    ORDER BY plans.mau
    LIMIT 1);
End;  
$$;


CREATE OR REPLACE FUNCTION "public"."find_fit_plan_v3"("mau" bigint, "bandwidth" double precision, "storage" double precision) RETURNS TABLE("name" character varying)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN

RETURN QUERY (
  SELECT plans.name
  FROM plans
  WHERE plans.mau >= find_fit_plan_v3.mau
    AND plans.storage >= find_fit_plan_v3.storage
    AND plans.bandwidth >= find_fit_plan_v3.bandwidth
    OR plans.name = 'Pay as you go'
  ORDER BY plans.mau
);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_total_stats_v4(userid uuid)
 RETURNS TABLE(mau bigint, bandwidth double precision, storage double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    anchor_start date;
    anchor_end date;
    apps text;
    total_storage double precision;
BEGIN
    SELECT subscription_anchor_start, subscription_anchor_end INTO anchor_start, anchor_end
    FROM stripe_info
    WHERE customer_id=(SELECT customer_id from users where id=userid);

    select (SELECT json_agg(app_id) from apps where user_id=userid)::text into apps;

    -- Get the total storage size by calling the get_total_storage_size function
    SELECT get_total_storage_size(userid) INTO total_storage;

    -- Use the app_ids variable in the query
    RETURN QUERY 
    SELECT 
        COALESCE(SUM(raw_data.mau), 0)::bigint as mau,
        COALESCE(ROUND(convert_bytes_to_gb(SUM(raw_data.bandwidth))::numeric,2), 0)::float AS bandwidth,
        -- Use the total_storage variable for the storage column
        COALESCE(ROUND(convert_bytes_to_gb(total_storage)::numeric,2), 0)::float AS storage
    FROM (
    SELECT app_id,
        COALESCE(MAX(clickhouse_app_usage_parm.mau), 0) as mau,
        COALESCE(SUM(clickhouse_app_usage_parm.bandwidth), 0) as bandwidth
        FROM clickhouse_app_usage_parm
        WHERE _app_list=apps
        AND _start_date=anchor_start
        AND _end_date=anchor_end
        GROUP BY app_id
    ) AS raw_data;
END;  
$function$;

CREATE OR REPLACE FUNCTION public.get_plan_usage_percent(userid uuid)
 RETURNS double precision
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    current_plan_max stats_table;
    total_stats stats_table;
    percent_mau float;
    percent_bandwidth float;
    percent_storage float;
BEGIN
  -- Get the maximum values for the user's current plan
  current_plan_max := public.get_current_plan_max(userid);
  -- Get the user's maximum usage stats for the current date
  total_stats := public.get_total_stats_v4(userid);
  -- Calculate the percentage of usage for each stat and return the average
  percent_mau := convert_number_to_percent(total_stats.mau, current_plan_max.mau);
  percent_bandwidth := convert_number_to_percent(total_stats.bandwidth, current_plan_max.bandwidth);
  percent_storage := convert_number_to_percent(convert_bytes_to_gb(get_total_storage_size(userid)), current_plan_max.storage);

  RETURN round(GREATEST(percent_mau, percent_bandwidth, percent_storage)::numeric, 2);
END;
$function$;
