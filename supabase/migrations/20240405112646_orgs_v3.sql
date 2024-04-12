-- Add "management_email" to orgs and set the correct validation

ALTER TABLE orgs ADD COLUMN 
"management_email" text;

UPDATE orgs SET 
"management_email"=(select email from users where users.id=orgs.created_by);

ALTER TABLE orgs
ALTER COLUMN "management_email" SET NOT NULL;

ALTER TABLE orgs ADD CONSTRAINT "unique management_email on orgs" UNIQUE (management_email);

-- Add "customer_id" into orgs
ALTER TABLE orgs ADD COLUMN 
"customer_id" character varying;

ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "orgs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."stripe_info"("customer_id");

ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "unique customer_id on orgs" UNIQUE ("customer_id");
  
-- Copy the data
UPDATE orgs SET
"customer_id"=(select customer_id from users where users.id=orgs.created_by);

-- Migrate notifications
ALTER TABLE notifications ADD COLUMN 
owner_org uuid;

-- Set owner_org
UPDATE notifications
SET owner_org=get_user_main_org_id(user_id);

-- Mark owner_org as not null
-- ALTER TABLE apps
-- ALTER COLUMN owner_org SET NOT NULL;

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;

ALTER TABLE notifications
ALTER COLUMN owner_org SET NOT NULL;

ALTER TABLE notifications
DROP COLUMN user_id;

-- Fix org create trigger
CREATE OR REPLACE FUNCTION generate_org_on_user_create() RETURNS TRIGGER AS $_$
DECLARE
  org_record record;
BEGIN
    -- Add management_email compared to old fn
    INSERT INTO orgs (created_by, name, management_email) values (NEW.id, format('%s organization', NEW.first_name), NEW.email) RETURNING * into org_record;
    INSERT INTO org_users (user_id, org_id, user_right) values (NEW.id, org_record.id, 'super_admin'::"user_min_right");

    RETURN NEW;
END $_$ LANGUAGE 'plpgsql' SECURITY DEFINER;

CREATE TRIGGER on_org_create 
AFTER INSERT ON public.orgs 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_organization_create');

-- Change RLS for the plans table - required due to a new build step
-- This has alredy been changed in prod
ALTER POLICY "Enable select for authenticated users only" ON "public"."plans" TO anon;
ALTER POLICY "Enable select for authenticated users only" ON "public"."plans" RENAME TO "Enable select for anyone";


-- General fn changes

DROP FUNCTION public.get_cycle_info();

CREATE OR REPLACE FUNCTION public.get_cycle_info_org("orgid" "uuid")
RETURNS TABLE (
    subscription_anchor_start timestamp with time zone,
    subscription_anchor_end timestamp with time zone
) AS $$
DECLARE
    customer_id_var text;
BEGIN
    SELECT customer_id INTO customer_id_var FROM orgs WHERE id = orgid;

    -- Get the stripe_info using the customer_id
    RETURN QUERY
    WITH cycle_info AS (
        SELECT stripe_info.subscription_anchor_start, stripe_info.subscription_anchor_end 
        FROM stripe_info 
        WHERE customer_id = customer_id_var
    )
    SELECT 
        CASE 
            WHEN now() BETWEEN cycle_info.subscription_anchor_start AND cycle_info.subscription_anchor_end THEN cycle_info.subscription_anchor_start
            ELSE date_trunc('MONTH', now()) + (cycle_info.subscription_anchor_start - date_trunc('MONTH', cycle_info.subscription_anchor_start))
        END,
        CASE 
            WHEN now() BETWEEN cycle_info.subscription_anchor_start AND cycle_info.subscription_anchor_end THEN cycle_info.subscription_anchor_end
            ELSE date_trunc('MONTH', now()) + (cycle_info.subscription_anchor_start - date_trunc('MONTH', cycle_info.subscription_anchor_start)) + INTERVAL '1 month'
        END
    FROM cycle_info;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.get_total_stats_v5_org(orgid uuid)
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
    SELECT * INTO cycle_info FROM public.get_cycle_info_org(orgid) LIMIT 1;

    -- Get the total storage size by calling the get_total_storage_size function
    SELECT get_total_storage_size_org(orgid) INTO total_storage;

    -- Construct the URL
    url := get_db_url() || '/functions/v1/' || '/triggers/get_total_stats'; -- Use the confirmed URL

    -- Set up the headers
    req_headers := ARRAY[
        http_header('apisecret', get_apikey()) -- Replace with your actual API secret
    ];

    -- Prepare the body with the necessary parameters, using the correct keys and dates from get_cycle_info
    req_body := jsonb_build_object(
        'orgId', orgId::text,
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
            ROUND(convert_bytes_to_gb(total_bandwidth)::numeric, 2)::double precision AS bandwidth,
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

CREATE OR REPLACE FUNCTION "public"."is_paying_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  from stripe_info
  where customer_id=(SELECT customer_id from orgs where id=orgid)
  AND status = 'succeeded'));
End;  
$$;

CREATE OR REPLACE FUNCTION "public"."is_trial_org"("orgid" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT GREATEST((trial_at::date - (now())::date), 0) AS days
  from stripe_info
  where customer_id=(SELECT customer_id from orgs where id=orgid));
End;  
$$;

CREATE OR REPLACE FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  from stripe_info
  where customer_id=(SELECT customer_id from orgs where id=orgid)
  AND (
    (status = 'succeeded' AND is_good_plan = true) -- is_good_plan = true AND <-- TODO: reenable is_good_plan in the future
    OR (subscription_id = 'free') -- TODO: allow free plan again
    -- OR (subscription_id = 'free' or subscription_id is null)
    OR (trial_at::date - (now())::date > 0)
  )
  )
);
End;  
$$;

CREATE OR REPLACE FUNCTION "public"."get_current_plan_name_org"("orgid" "uuid") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN 
  (SELECT name
  FROM plans
    WHERE stripe_id=(SELECT product_id
    from stripe_info
    where customer_id=(SELECT customer_id from orgs where id=orgid)
    ));
End;  
$$;

CREATE OR REPLACE FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") RETURNS TABLE("mau" bigint, "bandwidth" double precision, "storage" double precision)
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

CREATE OR REPLACE FUNCTION public.get_plan_usage_percent_org(orgid uuid)
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
  current_plan_max := public.get_current_plan_max_org(orgid);
  -- Get the user's maximum usage stats for the current date
  total_stats := public.get_total_stats_v5_org(orgid);
  -- Calculate the percentage of usage for each stat and return the average
  percent_mau := convert_number_to_percent(total_stats.mau, current_plan_max.mau);
  percent_bandwidth := convert_number_to_percent(total_stats.bandwidth, current_plan_max.bandwidth);
  percent_storage := convert_number_to_percent(convert_bytes_to_gb(get_total_storage_size_org(orgid)), current_plan_max.storage);

  RETURN round(GREATEST(percent_mau, percent_bandwidth, percent_storage)::numeric, 2);
END;
$function$;


CREATE OR REPLACE FUNCTION "public"."is_allowed_action_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
    RETURN is_paying_and_good_plan_org(orgid);
End;
$$;


-- Drop some old fn
DROP FUNCTION public.is_allowed_action(apikey text, appid character varying);

CREATE OR REPLACE FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN is_allowed_action_org((select owner_org from apps where app_id=appid));
End;
$$;

CREATE OR REPLACE FUNCTION "public"."is_onboarded_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM apps
  WHERE owner_org=orgid)) AND (SELECT EXISTS (SELECT 1
  FROM app_versions
  WHERE owner_org=orgid));
End;
$$;

CREATE OR REPLACE FUNCTION public.is_good_plan_v5_org(orgid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    current_plan_total stats_table;
BEGIN
  SELECT * INTO current_plan_total FROM public.get_total_stats_v5_org(orgid);
    RETURN (select 1 from find_fit_plan_v3(
    current_plan_total.mau,
    current_plan_total.bandwidth,
    current_plan_total.storage) where find_fit_plan_v3.name = (SELECT get_current_plan_name_org(orgid)));
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_canceled_org(orgid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  from stripe_info
  where customer_id=(SELECT customer_id from orgs where id=orgid)
  AND status = 'canceled'));
End;  
$$;

-- Add management_email compared to get_orgs_v4

CREATE OR REPLACE FUNCTION "public"."get_orgs_v5"("userid" "uuid") RETURNS TABLE(
  gid uuid, 
  created_by uuid, 
  logo text, 
  name text, 
  role varchar, 
  paying boolean, 
  trial_left integer, 
  can_use_more boolean, 
  is_canceled boolean, 
  app_count bigint,
  subscription_start timestamp with time zone,
  subscription_end timestamp with time zone,
  management_email text
)
LANGUAGE "plpgsql" SECURITY DEFINER
  AS $$
BEGIN
  return query select 
  sub.id as gid, 
  sub.created_by, 
  sub.logo, 
  sub.name, 
  org_users.user_right::varchar, 
  is_paying_org(sub.id) as paying, 
  is_trial_org(sub.id) as trial_left, 
  is_allowed_action_org(sub.id) as can_use_more,
  is_canceled_org(sub.id) as is_canceled,
  (select count(*) from apps where owner_org = sub.id) as app_count,
  (sub.f).subscription_anchor_start as subscription_start,
  (sub.f).subscription_anchor_end as subscription_end,
  sub.management_email as management_email
  from (
    select get_cycle_info_org(o.id) as f, o.* as o from orgs as o
  ) sub
  join org_users on (org_users."user_id"=get_orgs_v5.userid and sub.id = org_users."org_id");
END;  
$$;

CREATE OR REPLACE FUNCTION "public"."get_orgs_v5"() RETURNS TABLE(
  gid uuid, 
  created_by uuid, 
  logo text, 
  name text, 
  role varchar, 
  paying boolean, 
  trial_left integer, 
  can_use_more boolean, 
  is_canceled boolean, 
  app_count bigint,
  subscription_start timestamp with time zone,
  subscription_end timestamp with time zone,
  management_email text
)
LANGUAGE "plpgsql" SECURITY DEFINER
  AS $$
DECLARE
  user_id uuid;
BEGIN
  SELECT get_identity('{read,upload,write,all}'::"public"."key_mode"[]) into user_id;
  IF user_id IS NOT DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'Cannot do that as postgres!';
  END IF;

  return query select * from get_orgs_v5("user_id");
END;  
$$;

REVOKE EXECUTE ON FUNCTION "public"."get_orgs_v5"("userid" "uuid") FROM public;
REVOKE EXECUTE ON FUNCTION "public"."get_orgs_v5"("userid" "uuid") FROM anon;
REVOKE EXECUTE ON FUNCTION "public"."get_orgs_v5"("userid" "uuid") FROM authenticated;
GRANT EXECUTE ON FUNCTION "public"."get_orgs_v5"("userid" "uuid") TO postgres;
GRANT EXECUTE ON FUNCTION "public"."get_orgs_v5"("userid" "uuid") TO service_role;