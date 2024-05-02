drop FUNCTION "public"."find_fit_plan_v3"("mau" bigint, "bandwidth" double precision, "storage" double precision);
drop function "public"."get_current_plan_max_org"("orgid" "uuid");
drop FUNCTION "public"."get_metered_usage"("userid" "uuid");
drop type "public"."stats_table";
drop FUNCTION "public"."convert_number_to_percent"("val" double precision, "max_val" double precision) ;

CREATE TYPE "public"."stats_table" AS (
	"mau" bigint,
	"bandwidth" bigint,
	"storage" bigint
);

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

CREATE OR REPLACE FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") RETURNS TABLE("mau" bigint, "bandwidth" bigint, "storage" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN QUERY
  (SELECT plans.mau, plans.bandwidth, plans.storage
  FROM plans
    WHERE stripe_id=(
      SELECT product_id
      from stripe_info
      where customer_id=(
        SELECT customer_id
        from orgs
        where id=orgid)
  ));
End;  
$$;

CREATE OR REPLACE FUNCTION "public"."get_metered_usage"("orgid" "uuid") RETURNS "public"."stats_table"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    current_usage stats_table;
    max_plan stats_table;
    result stats_table;
BEGIN
  -- Get the total values for the user's current usage
  SELECT * INTO current_usage FROM public.get_total_metrics(orgid);
  SELECT * INTO max_plan FROM public.get_current_plan_max_org(orgid);
  result.mau = current_usage.mau - max_plan.mau;
  result.mau = (CASE WHEN result.mau > 0 THEN result.mau ELSE 0 END);
  result.bandwidth = current_usage.bandwidth - max_plan.bandwidth;
  result.bandwidth = (CASE WHEN result.bandwidth > 0 THEN result.bandwidth ELSE 0 END);
  result.storage = current_usage.storage - max_plan.storage;
  result.storage = (CASE WHEN result.storage > 0 THEN result.storage ELSE 0 END);
  RETURN result;
END;
$$;


CREATE OR REPLACE FUNCTION "public"."convert_number_to_percent"("val" double precision, "max_val" double precision) 
RETURNS double precision
LANGUAGE "plpgsql"
AS $$
BEGIN
  RETURN round(((val * 100) / max_val)::numeric, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_plan_usage_percent_detailed(orgid uuid, cycle_start date, cycle_end date)
 RETURNS TABLE (
   total_percent double precision,
   mau_percent double precision,
   bandwidth_percent double precision,
   storage_percent double precision
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    current_plan_max stats_table;
    total_stats stats_table;
    percent_mau double precision;
    percent_bandwidth double precision;
    percent_storage double precision;
BEGIN
  -- Get the maximum values for the user's current plan
  current_plan_max := public.get_current_plan_max_org(orgid);
  
  -- Get the user's maximum usage stats for the specified billing cycle
  SELECT mau, bandwidth, storage
  INTO total_stats
  FROM get_total_metrics(orgid, cycle_start, cycle_end);
  
  -- Calculate the percentage of usage for each stat
  percent_mau := convert_number_to_percent(total_stats.mau, current_plan_max.mau);
  percent_bandwidth := convert_number_to_percent(total_stats.bandwidth, current_plan_max.bandwidth);
  percent_storage := convert_number_to_percent(total_stats.storage, current_plan_max.storage);

  -- Return the total usage percentage and the individual usage percentages
  RETURN QUERY SELECT
    GREATEST(percent_mau, percent_bandwidth, percent_storage) AS total_percent,
    percent_mau AS mau_percent,
    percent_bandwidth AS bandwidth_percent,
    percent_storage AS storage_percent;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_plan_usage_percent_detailed(orgid uuid)
 RETURNS TABLE (
   total_percent double precision,
   mau_percent double precision,
   bandwidth_percent double precision,
   storage_percent double precision
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    cycle_start date;
    cycle_end date;
BEGIN
  -- Get the start and end dates of the current billing cycle
  SELECT subscription_anchor_start::date, subscription_anchor_end::date
  INTO cycle_start, cycle_end
  FROM get_cycle_info_org(orgid);
  
  -- Call the function with billing cycle dates as parameters
  RETURN QUERY
  SELECT * FROM public.get_plan_usage_percent_detailed(orgid, cycle_start, cycle_end);
END;
$function$;

