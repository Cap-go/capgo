drop function count_all_plans;
drop function count_all_trial;
drop function exist_user;
-- we could cleanup get_app_versions but it's really bizzare in the upload cli
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
-- get_plan_usage_percent_org but idk if we use it. I don;t think so but i am not 100% sure
drop FUNCTION public.get_total_app_storage_size(app_id character varying);
drop FUNCTION public.get_total_app_storage_size(userid uuid, app_id character varying);
drop function get_total_stats_v5; -- could break typesafety, we still use the type
drop function "public"."get_total_storage_size"("userid" "uuid");
drop function "public"."get_total_storage_size"();
drop function get_usage_mode_and_last_saved;
-- get_user_main_org_id, get_user_main_org_id_by_app_id- this we should not be using but i would not drop it
-- get_weekly_stats -> we can likely drop but technicly the email uses this
drop function has_min_right;
drop function has_read_rights;
drop FUNCTION "public"."is_allowed_action"("apikey" "text"); -- i think we can drop it, please reverify
-- again, check again
drop function "public"."is_allowed_action_user"("userid" "uuid");
drop function "public"."is_allowed_action_user"();
-- I don;t care too much. Let's leave it
-- drop FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying);
-- drop FUNCTION "public"."is_app_owner"("apikey" text, "appid" character varying)
drop function "public"."is_canceled"("userid" "uuid");
drop function "public"."is_canceled"();
drop function is_good_plan_v5;
-- drop function is_member_of_org;
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
