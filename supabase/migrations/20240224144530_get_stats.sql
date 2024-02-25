CREATE OR REPLACE FUNCTION public.get_total_stats_v5(userid uuid)
RETURNS TABLE(mau bigint, bandwidth double precision, storage double precision)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    cycle_info RECORD;
    response http_response;
    url text;
    req_headers http_header[];
    req_body text;
    app_activity jsonb; -- Declare app_activity as jsonb
    total_mau bigint := 0;
    total_bandwidth numeric := 0;
    total_storage double precision;
BEGIN
    -- Retrieve the subscription anchor start and end dates using get_cycle_info function
    SELECT * INTO cycle_info FROM public.get_cycle_info(userid) LIMIT 1;

    -- Get the total storage size by calling the get_total_storage_size function
    SELECT get_total_storage_size(userid) INTO total_storage;

    -- Construct the URL
    url := get_db_url() || '/functions/v1/' || '/triggers/get_total_stats'; -- Use the confirmed URL

    -- Set up the headers
    req_headers := ARRAY[
        http_header('apisecret', 'Your_API_Secret_Here') -- Replace with your actual API secret
    ];

    -- Prepare the body with the necessary parameters, using the correct keys and dates from get_cycle_info
    req_body := jsonb_build_object(
        'userId', userid::text,
        'startDate', to_char(cycle_info.subscription_anchor_start, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'endDate', to_char(cycle_info.subscription_anchor_end, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )::text;

    -- Make the synchronous HTTP POST request, including the headers
    response := http((
        'POST',
        url,
        req_headers,
        'application/json',
        req_body
    )::http_request);

    -- Check if the request was successful
    IF response.status = 200 THEN
        -- Parse the JSON response and loop through each app activity
        FOR app_activity IN SELECT * FROM jsonb_array_elements(response.content::jsonb)
        LOOP
            total_mau := total_mau + (app_activity ->> 'mau')::bigint;
            total_bandwidth := total_bandwidth + (app_activity ->> 'bandwidth')::numeric;
        END LOOP;

        -- Return the aggregated results
        RETURN QUERY SELECT
            total_mau AS mau,
            ROUND(total_bandwidth, 2)::double precision AS bandwidth,
            ROUND(convert_bytes_to_gb(total_storage)::numeric, 2)::double precision AS storage;
    ELSE
        -- If the request was not successful, return empty data
        RETURN QUERY SELECT
            0::bigint AS mau,
            0::double precision AS bandwidth,
            0::double precision AS storage;
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_good_plan_v5(userid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    current_plan_total stats_table;
BEGIN
  SELECT * INTO current_plan_total FROM public.get_total_stats_v5(userid);
    RETURN (select 1 from  find_fit_plan_v3(
    current_plan_total.mau,
    current_plan_total.bandwidth,
    current_plan_total.storage) where find_fit_plan_v3.name = (SELECT get_current_plan_name(userid)));
END;
$function$
