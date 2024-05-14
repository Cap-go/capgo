drop function count_all_plans;
drop function count_all_trial;
drop function exist_user;
drop function "public"."get_current_plan_max"("userid" "uuid");
drop function "public"."get_current_plan_max"();
drop function "public"."get_current_plan_name"("userid" "uuid");
drop function "public"."get_current_plan_name"();
drop function get_cycle_info;
drop function get_devices_version;
drop function "public"."get_max_plan"("userid" "uuid");
drop function "public"."get_max_plan"();
drop function get_orgs_v2;
drop function get_orgs_v3;
drop function "public"."get_orgs_v4"("userid" "uuid");
drop function "public"."get_orgs_v4"();
drop function "public"."get_plan_usage_percent"("userid" "uuid");
drop function "public"."get_plan_usage_percent"();
drop function "public"."get_plan_usage_percent_org"("orgid" "uuid");
drop FUNCTION public.get_total_app_storage_size(app_id character varying);
drop FUNCTION public.get_total_app_storage_size(userid uuid, app_id character varying);
drop function get_total_stats_v5;
drop function "public"."get_total_storage_size"("userid" "uuid");
drop function "public"."get_total_storage_size"();
drop function get_usage_mode_and_last_saved;
drop function get_user_main_org_id;
-- get_user_main_org_id_by_app_id - this we should not be using but i would not drop it it's used in has_app_right
drop function get_weekly_stats(app_id character varying);
CREATE or replace FUNCTION "public"."get_weekly_stats"("app_id" character varying)
RETURNS TABLE(all_updates bigint, failed_updates bigint, open_app bigint) AS $$
Declare
  seven_days_ago DATE;
  all_updates bigint;
  failed_updates bigint;
Begin
  seven_days_ago := CURRENT_DATE - INTERVAL '7 days';
  
  SELECT COALESCE(SUM(install), 0)
  INTO all_updates
  FROM public.daily_version
  WHERE date BETWEEN seven_days_ago AND CURRENT_DATE
  AND app_id = get_weekly_stats.app_id;

  SELECT COALESCE(SUM(fail), 0)
  INTO failed_updates
  FROM public.daily_version
  WHERE date BETWEEN seven_days_ago AND CURRENT_DATE
  AND app_id = get_weekly_stats.app_id;

  SELECT COALESCE(SUM(get), 0)
  INTO open_app
  FROM public.daily_version
  WHERE date BETWEEN seven_days_ago AND CURRENT_DATE
  AND app_id = get_weekly_stats.app_id;

  RETURN query (select all_updates, failed_updates, open_app);
End;
$$ LANGUAGE plpgsql;

drop function has_min_right;
drop function has_read_rights;
drop FUNCTION "public"."is_allowed_action"("apikey" "text"); -- i think we can drop it, please reverify
-- again, check again
drop function "public"."is_allowed_action_user"("userid" "uuid");
drop function "public"."is_allowed_action_user"();
drop function "public"."is_canceled"("userid" "uuid");
drop function "public"."is_canceled"();
drop function is_good_plan_v5;
drop function "public"."is_onboarded"("userid" "uuid");
drop function "public"."is_onboarded"();

drop function "public"."is_onboarding_needed"("userid" "uuid");
drop function "public"."is_onboarding_needed"();
CREATE OR REPLACE FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (NOT is_onboarded_org(orgid)) AND is_trial_org(orgid) = 0;
End;
$$;

drop function "public"."is_paying"("userid" "uuid");
drop function "public"."is_paying"();
drop function "public"."is_paying_and_good_plan"("userid" "uuid");
drop function "public"."is_paying_and_good_plan"();
drop function "public"."is_trial"("userid" "uuid");
drop function "public"."is_trial"();
drop function remove_enum_value;
drop function trigger_http_post_to_function;
