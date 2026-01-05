-- Revoke public access to internal cron/admin functions
-- These functions are internal utilities that should only be called by postgres/service_role
-- Many expose internal API secrets via get_apikey() or perform admin operations
-- They should not be accessible to anon/authenticated users

CREATE OR REPLACE FUNCTION "public"."cleanup_frequent_job_details"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    DELETE FROM cron.job_run_details
    WHERE job_pid IN (
        SELECT jobid
        FROM cron.job
        WHERE schedule = '5 seconds' OR schedule = '1 seconds' OR schedule = '10 seconds'
    )
    AND end_time < NOW() - interval '1 hour';
END;
$$;

CREATE OR REPLACE FUNCTION "public"."cleanup_job_run_details_7days"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  DELETE FROM cron.job_run_details WHERE end_time < NOW() - interval '7 days';
END;
$$;

CREATE OR REPLACE FUNCTION "public"."remove_old_jobs"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    DELETE FROM cron.job_run_details
    WHERE end_time < NOW() - interval '1 day';
END;
$$;

CREATE OR REPLACE FUNCTION "public"."noupdate" () RETURNS "trigger" LANGUAGE "plpgsql" SECURITY DEFINER
SET
  search_path = '' AS $_$
DECLARE
    val RECORD;
    is_different boolean;
BEGIN
    -- API key? We do not care
    IF (SELECT auth.uid()) IS NULL THEN
        RETURN NEW;
    END IF;

    -- If the user has the 'admin' role then we do not care
    IF public.check_min_rights('admin'::"public"."user_min_right", (SELECT auth.uid()), OLD.owner_org, NULL::character varying, NULL::bigint) THEN
        RETURN NEW;
    END IF;

    FOR val IN
      SELECT * from json_each_text(row_to_json(NEW))
    LOOP
      -- raise warning '?? % % %', val.key, val.value, format('SELECT (NEW."%s" <> OLD."%s")', val.key, val.key);

      EXECUTE format('SELECT ($1."%s" is distinct from $2."%s")', val.key, val.key) USING NEW, OLD
      INTO is_different;

      IF is_different AND val.key <> 'version' AND val.key <> 'updated_at' THEN
          RAISE EXCEPTION 'not allowed %', val.key;
      END IF;
    END LOOP;

   RETURN NEW;
END;$_$;

-- =============================================================================
-- PROCESS_FUNCTION_QUEUE - Core queue processing (uses get_apikey())
-- =============================================================================
REVOKE ALL ON FUNCTION "public"."process_function_queue" ("queue_names" "text"[], "batch_size" integer) FROM "public";
REVOKE ALL ON FUNCTION "public"."process_function_queue" ("queue_names" "text"[], "batch_size" integer) FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_function_queue" ("queue_names" "text"[], "batch_size" integer) FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."process_function_queue" ("queue_names" "text"[], "batch_size" integer) FROM "service_role";

REVOKE ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) FROM "public";
REVOKE ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) FROM "service_role";

-- =============================================================================
-- CRON/QUEUE PROCESSING FUNCTIONS (internal scheduler functions)
-- =============================================================================
REVOKE ALL ON FUNCTION "public"."process_admin_stats"() FROM "public";
REVOKE ALL ON FUNCTION "public"."process_admin_stats"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_admin_stats"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."process_admin_stats"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."process_all_cron_tasks"() FROM "public";
REVOKE ALL ON FUNCTION "public"."process_all_cron_tasks"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_all_cron_tasks"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."process_all_cron_tasks"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."process_billing_period_stats_email"() FROM "public";
REVOKE ALL ON FUNCTION "public"."process_billing_period_stats_email"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_billing_period_stats_email"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."process_billing_period_stats_email"() FROM "service_role";

ALTER FUNCTION "public"."process_channel_device_counts_queue" ("batch_size" integer) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."process_channel_device_counts_queue"("batch_size" integer) FROM "public";
REVOKE ALL ON FUNCTION "public"."process_channel_device_counts_queue"("batch_size" integer) FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_channel_device_counts_queue"("batch_size" integer) FROM "authenticated";
-- Keep service_role access as it's called via Supabase RPC from tests/backend
GRANT EXECUTE ON FUNCTION "public"."process_channel_device_counts_queue"("batch_size" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."process_cron_stats_jobs"() FROM "public";
REVOKE ALL ON FUNCTION "public"."process_cron_stats_jobs"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_cron_stats_jobs"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."process_cron_stats_jobs"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."process_deploy_install_stats_email"() FROM "public";
REVOKE ALL ON FUNCTION "public"."process_deploy_install_stats_email"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_deploy_install_stats_email"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."process_deploy_install_stats_email"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."process_stats_email_monthly"() FROM "public";
REVOKE ALL ON FUNCTION "public"."process_stats_email_monthly"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_stats_email_monthly"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."process_stats_email_monthly"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."process_stats_email_weekly"() FROM "public";
REVOKE ALL ON FUNCTION "public"."process_stats_email_weekly"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_stats_email_weekly"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."process_stats_email_weekly"() FROM "service_role";

-- =============================================================================
-- CLEANUP/MAINTENANCE FUNCTIONS (should only run via cron)
-- =============================================================================
REVOKE ALL ON FUNCTION "public"."cleanup_expired_apikeys"() FROM "public";
REVOKE ALL ON FUNCTION "public"."cleanup_expired_apikeys"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."cleanup_expired_apikeys"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."cleanup_expired_apikeys"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."cleanup_frequent_job_details"() FROM "public";
REVOKE ALL ON FUNCTION "public"."cleanup_frequent_job_details"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."cleanup_frequent_job_details"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."cleanup_frequent_job_details"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."cleanup_job_run_details_7days"() FROM "public";
REVOKE ALL ON FUNCTION "public"."cleanup_job_run_details_7days"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."cleanup_job_run_details_7days"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."cleanup_job_run_details_7days"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."cleanup_old_audit_logs"() FROM "public";
REVOKE ALL ON FUNCTION "public"."cleanup_old_audit_logs"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."cleanup_old_audit_logs"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."cleanup_old_audit_logs"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."cleanup_queue_messages"() FROM "public";
REVOKE ALL ON FUNCTION "public"."cleanup_queue_messages"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."cleanup_queue_messages"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."cleanup_queue_messages"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."cleanup_webhook_deliveries"() FROM "public";
REVOKE ALL ON FUNCTION "public"."cleanup_webhook_deliveries"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."cleanup_webhook_deliveries"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."cleanup_webhook_deliveries"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."remove_old_jobs"() FROM "public";
REVOKE ALL ON FUNCTION "public"."remove_old_jobs"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."remove_old_jobs"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."remove_old_jobs"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."expire_usage_credits"() FROM "public";
REVOKE ALL ON FUNCTION "public"."expire_usage_credits"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."expire_usage_credits"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."expire_usage_credits"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."delete_old_deleted_apps"() FROM "public";
REVOKE ALL ON FUNCTION "public"."delete_old_deleted_apps"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."delete_old_deleted_apps"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."delete_old_deleted_apps"() FROM "service_role";

-- =============================================================================
-- SENSITIVE DATA/ADMIN FUNCTIONS
-- =============================================================================
-- get_db_url exposes database connection string
REVOKE ALL ON FUNCTION "public"."get_db_url"() FROM "public";
REVOKE ALL ON FUNCTION "public"."get_db_url"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_db_url"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."get_db_url"() FROM "service_role";

-- Admin statistics functions - internal use only
REVOKE ALL ON FUNCTION "public"."get_customer_counts"() FROM "public";
REVOKE ALL ON FUNCTION "public"."get_customer_counts"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_customer_counts"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."get_update_stats"() FROM "public";
REVOKE ALL ON FUNCTION "public"."get_update_stats"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_update_stats"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."get_update_stats"() FROM "service_role";

-- =============================================================================
-- TRIGGER FUNCTIONS (should never be called directly)
-- =============================================================================
REVOKE ALL ON FUNCTION "public"."enqueue_channel_device_counts"() FROM "public";
REVOKE ALL ON FUNCTION "public"."enqueue_channel_device_counts"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."enqueue_channel_device_counts"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."enqueue_channel_device_counts"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."enqueue_credit_usage_alert"() FROM "public";
REVOKE ALL ON FUNCTION "public"."enqueue_credit_usage_alert"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."enqueue_credit_usage_alert"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."enqueue_credit_usage_alert"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."audit_log_trigger"() FROM "public";
REVOKE ALL ON FUNCTION "public"."audit_log_trigger"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."audit_log_trigger"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."audit_log_trigger"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."auto_apikey_name_by_id"() FROM "public";
REVOKE ALL ON FUNCTION "public"."auto_apikey_name_by_id"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."auto_apikey_name_by_id"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."auto_apikey_name_by_id"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."auto_owner_org_by_app_id"() FROM "public";
REVOKE ALL ON FUNCTION "public"."auto_owner_org_by_app_id"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."auto_owner_org_by_app_id"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."auto_owner_org_by_app_id"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."check_if_org_can_exist"() FROM "public";
REVOKE ALL ON FUNCTION "public"."check_if_org_can_exist"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."check_if_org_can_exist"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."check_if_org_can_exist"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."check_org_user_privileges"() FROM "public";
REVOKE ALL ON FUNCTION "public"."check_org_user_privileges"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."check_org_user_privileges"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."check_org_user_privileges"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."force_valid_user_id_on_app"() FROM "public";
REVOKE ALL ON FUNCTION "public"."force_valid_user_id_on_app"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."force_valid_user_id_on_app"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."force_valid_user_id_on_app"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."generate_org_on_user_create"() FROM "public";
REVOKE ALL ON FUNCTION "public"."generate_org_on_user_create"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."generate_org_on_user_create"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."generate_org_on_user_create"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."generate_org_user_on_org_create"() FROM "public";
REVOKE ALL ON FUNCTION "public"."generate_org_user_on_org_create"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."generate_org_user_on_org_create"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."generate_org_user_on_org_create"() FROM "service_role";

-- NOTE: noupdate() is a trigger function used on the channels table.
-- Users need EXECUTE permission on trigger functions to perform table operations.
-- Revoking access would break channel updates for authenticated users.
REVOKE ALL ON FUNCTION "public"."noupdate"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."noupdate"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."noupdate"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."noupdate"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."record_deployment_history"() FROM "public";
REVOKE ALL ON FUNCTION "public"."record_deployment_history"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."record_deployment_history"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."record_deployment_history"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."trigger_webhook_on_audit_log"() FROM "public";
REVOKE ALL ON FUNCTION "public"."trigger_webhook_on_audit_log"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."trigger_webhook_on_audit_log"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."trigger_webhook_on_audit_log"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."update_webhook_updated_at"() FROM "public";
REVOKE ALL ON FUNCTION "public"."update_webhook_updated_at"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."update_webhook_updated_at"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."update_webhook_updated_at"() FROM "service_role";

-- =============================================================================
-- INTERNAL CREDIT/BILLING FUNCTIONS (admin operations)
-- =============================================================================
REVOKE ALL ON FUNCTION "public"."apply_usage_overage"("p_org_id" "uuid", "p_metric" "public"."credit_metric_type", "p_overage_amount" numeric, "p_billing_cycle_start" timestamp with time zone, "p_billing_cycle_end" timestamp with time zone, "p_details" "jsonb") FROM "public";
REVOKE ALL ON FUNCTION "public"."apply_usage_overage"("p_org_id" "uuid", "p_metric" "public"."credit_metric_type", "p_overage_amount" numeric, "p_billing_cycle_start" timestamp with time zone, "p_billing_cycle_end" timestamp with time zone, "p_details" "jsonb") FROM "anon";
REVOKE ALL ON FUNCTION "public"."apply_usage_overage"("p_org_id" "uuid", "p_metric" "public"."credit_metric_type", "p_overage_amount" numeric, "p_billing_cycle_start" timestamp with time zone, "p_billing_cycle_end" timestamp with time zone, "p_details" "jsonb") FROM "authenticated";
-- Do not revoke from service_role as it is used in billing operations

REVOKE ALL ON FUNCTION "public"."calculate_credit_cost"("p_metric" "public"."credit_metric_type", "p_overage_amount" numeric) FROM "public";
REVOKE ALL ON FUNCTION "public"."calculate_credit_cost"("p_metric" "public"."credit_metric_type", "p_overage_amount" numeric) FROM "anon";
REVOKE ALL ON FUNCTION "public"."calculate_credit_cost"("p_metric" "public"."credit_metric_type", "p_overage_amount" numeric) FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."calculate_credit_cost"("p_metric" "public"."credit_metric_type", "p_overage_amount" numeric) FROM "service_role";

REVOKE ALL ON FUNCTION "public"."top_up_usage_credits"("p_org_id" "uuid", "p_amount" numeric, "p_expires_at" timestamp with time zone, "p_source" "text", "p_source_ref" "jsonb", "p_notes" "text") FROM "public";
REVOKE ALL ON FUNCTION "public"."top_up_usage_credits"("p_org_id" "uuid", "p_amount" numeric, "p_expires_at" timestamp with time zone, "p_source" "text", "p_source_ref" "jsonb", "p_notes" "text") FROM "anon";
REVOKE ALL ON FUNCTION "public"."top_up_usage_credits"("p_org_id" "uuid", "p_amount" numeric, "p_expires_at" timestamp with time zone, "p_source" "text", "p_source_ref" "jsonb", "p_notes" "text") FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."top_up_usage_credits"("p_org_id" "uuid", "p_amount" numeric, "p_expires_at" timestamp with time zone, "p_source" "text", "p_source_ref" "jsonb", "p_notes" "text") FROM "service_role";

-- =============================================================================
-- HTTP/QUEUE INTERNAL FUNCTIONS
-- =============================================================================
REVOKE ALL ON FUNCTION "public"."delete_http_response"("request_id" bigint) FROM "public";
REVOKE ALL ON FUNCTION "public"."delete_http_response"("request_id" bigint) FROM "anon";
REVOKE ALL ON FUNCTION "public"."delete_http_response"("request_id" bigint) FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."delete_http_response"("request_id" bigint) FROM "service_role";

REVOKE ALL ON FUNCTION "public"."mass_edit_queue_messages_cf_ids"("updates" "public"."message_update"[]) FROM "public";
REVOKE ALL ON FUNCTION "public"."mass_edit_queue_messages_cf_ids"("updates" "public"."message_update"[]) FROM "anon";
REVOKE ALL ON FUNCTION "public"."mass_edit_queue_messages_cf_ids"("updates" "public"."message_update"[]) FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."mass_edit_queue_messages_cf_ids"("updates" "public"."message_update"[]) FROM "service_role";

-- =============================================================================
-- PG_LOG FUNCTION (internal debugging - could leak sensitive info)
-- =============================================================================
REVOKE ALL ON FUNCTION "public"."pg_log"("decision" "text", "input" "jsonb") FROM "public";
REVOKE ALL ON FUNCTION "public"."pg_log"("decision" "text", "input" "jsonb") FROM "anon";
REVOKE ALL ON FUNCTION "public"."pg_log"("decision" "text", "input" "jsonb") FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."pg_log"("decision" "text", "input" "jsonb") FROM "service_role";

REVOKE ALL ON FUNCTION "public"."trigger_http_queue_post_to_function"() FROM "public";
REVOKE ALL ON FUNCTION "public"."trigger_http_queue_post_to_function"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."trigger_http_queue_post_to_function"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."trigger_http_queue_post_to_function"() FROM "service_role";

REVOKE ALL ON FUNCTION "public"."count_all_need_upgrade" () FROM "public";
REVOKE ALL ON FUNCTION "public"."count_all_need_upgrade" () FROM "anon";
REVOKE ALL ON FUNCTION "public"."count_all_need_upgrade" () FROM "authenticated";

-- count_all_onboarded
REVOKE ALL ON FUNCTION "public"."count_all_onboarded" () FROM "public";
REVOKE ALL ON FUNCTION "public"."count_all_onboarded" () FROM "anon";
REVOKE ALL ON FUNCTION "public"."count_all_onboarded" () FROM "authenticated";
-- count_all_plans_v2
REVOKE ALL ON FUNCTION "public"."count_all_plans_v2" () FROM "public";
REVOKE ALL ON FUNCTION "public"."count_all_plans_v2" () FROM "anon";
REVOKE ALL ON FUNCTION "public"."count_all_plans_v2" () FROM "authenticated";
-- get_versions_with_no_metadata
REVOKE ALL ON FUNCTION "public"."get_versions_with_no_metadata" () FROM "public";
REVOKE ALL ON FUNCTION "public"."get_versions_with_no_metadata" () FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_versions_with_no_metadata" () FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."get_versions_with_no_metadata" () FROM "service_role";
-- total_bundle_storage_bytes
REVOKE ALL ON FUNCTION "public"."total_bundle_storage_bytes" () FROM "public";
REVOKE ALL ON FUNCTION "public"."total_bundle_storage_bytes" () FROM "anon";
REVOKE ALL ON FUNCTION "public"."total_bundle_storage_bytes" () FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."total_bundle_storage_bytes" () FROM "service_role";
-- process_failed_uploads
REVOKE ALL ON FUNCTION "public"."process_failed_uploads" () FROM "public";
REVOKE ALL ON FUNCTION "public"."process_failed_uploads" () FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_failed_uploads" () FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."process_failed_uploads" () FROM "service_role";
-- process_free_trial_expired
REVOKE ALL ON FUNCTION "public"."process_free_trial_expired" () FROM "public";
REVOKE ALL ON FUNCTION "public"."process_free_trial_expired" () FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_free_trial_expired" () FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."process_free_trial_expired" () FROM "service_role";
-- set_bandwidth_exceeded_by_org
REVOKE ALL ON FUNCTION "public"."set_bandwidth_exceeded_by_org" (org_id uuid, disabled boolean) FROM "public";
REVOKE ALL ON FUNCTION "public"."set_bandwidth_exceeded_by_org" (org_id uuid, disabled boolean) FROM "anon";
REVOKE ALL ON FUNCTION "public"."set_bandwidth_exceeded_by_org" (org_id uuid, disabled boolean) FROM "authenticated";
-- Do not revoke from service_role as it is used in billing operations
-- set_build_time_exceeded_by_org
REVOKE ALL ON FUNCTION "public"."set_build_time_exceeded_by_org" (org_id uuid, disabled boolean) FROM "public";
REVOKE ALL ON FUNCTION "public"."set_build_time_exceeded_by_org" (org_id uuid, disabled boolean) FROM "anon";
REVOKE ALL ON FUNCTION "public"."set_build_time_exceeded_by_org" (org_id uuid, disabled boolean) FROM "authenticated";
-- Do not revoke from service_role as it is used in billing operations
-- set_mau_exceeded_by_org
REVOKE ALL ON FUNCTION "public"."set_mau_exceeded_by_org" (org_id uuid, disabled boolean) FROM "public";
REVOKE ALL ON FUNCTION "public"."set_mau_exceeded_by_org" (org_id uuid, disabled boolean) FROM "anon";
REVOKE ALL ON FUNCTION "public"."set_mau_exceeded_by_org" (org_id uuid, disabled boolean) FROM "authenticated";
-- Do not revoke from service_role as it is used in billing operations
-- set_storage_exceeded_by_org
REVOKE ALL ON FUNCTION "public"."set_storage_exceeded_by_org" (org_id uuid, disabled boolean) FROM "public";
REVOKE ALL ON FUNCTION "public"."set_storage_exceeded_by_org" (org_id uuid, disabled boolean) FROM "anon";
REVOKE ALL ON FUNCTION "public"."set_storage_exceeded_by_org" (org_id uuid, disabled boolean) FROM "authenticated";
-- Do not revoke from service_role as it is used in billing operations
