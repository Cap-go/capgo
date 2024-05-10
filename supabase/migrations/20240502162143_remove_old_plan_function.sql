CREATE OR REPLACE FUNCTION "public"."find_fit_plan_v3"("mau" bigint, "bandwidth" bigint, "storage" bigint) RETURNS TABLE("name" character varying)
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

CREATE OR REPLACE FUNCTION public.get_plan_usage_percent_org(orgid uuid)
 RETURNS double precision
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    current_plan_max stats_table;
    total_metrics RECORD;
    percent_mau float;
    percent_bandwidth float;
    percent_storage float;
BEGIN
  -- Get the maximum values for the user's current plan
  current_plan_max := public.get_current_plan_max_org(orgid);
  
  -- Get the user's maximum usage metrics for the current cycle
  SELECT * INTO total_metrics FROM public.get_total_metrics(orgid);
  
  -- Calculate the percentage of usage for each metric and return the average
  percent_mau := convert_number_to_percent(total_metrics.mau, current_plan_max.mau);
  percent_bandwidth := convert_number_to_percent(total_metrics.bandwidth, current_plan_max.bandwidth);
  percent_storage := convert_number_to_percent(convert_bytes_to_gb(total_metrics.storage), current_plan_max.storage);

  RETURN round(GREATEST(percent_mau, percent_bandwidth, percent_storage)::numeric, 2);
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_good_plan_v5_org(orgid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    total_metrics RECORD;
    current_plan_name TEXT;
BEGIN
  SELECT * INTO total_metrics FROM public.get_total_metrics(orgid);
  current_plan_name := (SELECT get_current_plan_name_org(orgid));
  
  RETURN EXISTS (
    SELECT 1 
    FROM find_fit_plan_v3(
      total_metrics.mau,
      total_metrics.bandwidth,
      total_metrics.storage
    ) 
    WHERE find_fit_plan_v3.name = current_plan_name
  );
END;
$function$;
