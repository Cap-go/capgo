-- Revoke public access to internal cron/admin functions
-- These functions are internal utilities that should only be called by postgres/service_role
-- Many expose internal API secrets via get_apikey() or perform admin operations
-- They should not be accessible to anon/authenticated users

-- =============================================================================
-- PROCESS_FUNCTION_QUEUE - Core queue processing (uses get_apikey())
-- =============================================================================
REVOKE ALL ON FUNCTION "public"."process_function_queue" ("queue_names" "text"[], "batch_size" integer) FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_function_queue" ("queue_names" "text"[], "batch_size" integer) FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) FROM "authenticated";

-- =============================================================================
-- CRON/QUEUE PROCESSING FUNCTIONS (internal scheduler functions)
-- =============================================================================
REVOKE ALL ON FUNCTION "public"."process_admin_stats"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_admin_stats"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."process_all_cron_tasks"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_all_cron_tasks"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."process_billing_period_stats_email"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_billing_period_stats_email"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."process_channel_device_counts_queue"("batch_size" integer) FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_channel_device_counts_queue"("batch_size" integer) FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."process_cron_stats_jobs"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_cron_stats_jobs"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."process_deploy_install_stats_email"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_deploy_install_stats_email"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."process_stats_email_monthly"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_stats_email_monthly"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."process_stats_email_weekly"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_stats_email_weekly"() FROM "authenticated";

-- =============================================================================
-- CLEANUP/MAINTENANCE FUNCTIONS (should only run via cron)
-- =============================================================================
REVOKE ALL ON FUNCTION "public"."cleanup_expired_apikeys"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."cleanup_expired_apikeys"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."cleanup_frequent_job_details"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."cleanup_frequent_job_details"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."cleanup_job_run_details_7days"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."cleanup_job_run_details_7days"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."cleanup_old_audit_logs"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."cleanup_old_audit_logs"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."cleanup_queue_messages"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."cleanup_queue_messages"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."cleanup_webhook_deliveries"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."cleanup_webhook_deliveries"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."remove_old_jobs"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."remove_old_jobs"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."expire_usage_credits"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."expire_usage_credits"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."delete_old_deleted_apps"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."delete_old_deleted_apps"() FROM "authenticated";

-- =============================================================================
-- SENSITIVE DATA/ADMIN FUNCTIONS
-- =============================================================================
-- get_db_url exposes database connection string
REVOKE ALL ON FUNCTION "public"."get_db_url"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_db_url"() FROM "authenticated";

-- Admin statistics functions - internal use only
REVOKE ALL ON FUNCTION "public"."get_customer_counts"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_customer_counts"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."get_update_stats"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_update_stats"() FROM "authenticated";

-- =============================================================================
-- TRIGGER FUNCTIONS (should never be called directly)
-- =============================================================================
REVOKE ALL ON FUNCTION "public"."enqueue_channel_device_counts"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."enqueue_channel_device_counts"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."enqueue_credit_usage_alert"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."enqueue_credit_usage_alert"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."audit_log_trigger"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."audit_log_trigger"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."auto_apikey_name_by_id"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."auto_apikey_name_by_id"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."auto_owner_org_by_app_id"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."auto_owner_org_by_app_id"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."check_if_org_can_exist"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."check_if_org_can_exist"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."check_org_user_privileges"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."check_org_user_privileges"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."force_valid_user_id_on_app"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."force_valid_user_id_on_app"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."generate_org_on_user_create"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."generate_org_on_user_create"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."generate_org_user_on_org_create"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."generate_org_user_on_org_create"() FROM "authenticated";

-- NOTE: noupdate() is a trigger function used on the channels table.
-- Users need EXECUTE permission on trigger functions to perform table operations.
-- Revoking access would break channel updates for authenticated users.
-- REVOKE ALL ON FUNCTION "public"."noupdate"() FROM "anon";
-- REVOKE ALL ON FUNCTION "public"."noupdate"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."record_deployment_history"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."record_deployment_history"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."trigger_webhook_on_audit_log"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."trigger_webhook_on_audit_log"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."update_webhook_updated_at"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."update_webhook_updated_at"() FROM "authenticated";

-- =============================================================================
-- INTERNAL CREDIT/BILLING FUNCTIONS (admin operations)
-- =============================================================================
REVOKE ALL ON FUNCTION "public"."apply_usage_overage"("p_org_id" "uuid", "p_metric" "public"."credit_metric_type", "p_overage_amount" numeric, "p_billing_cycle_start" timestamp with time zone, "p_billing_cycle_end" timestamp with time zone, "p_details" "jsonb") FROM "anon";
REVOKE ALL ON FUNCTION "public"."apply_usage_overage"("p_org_id" "uuid", "p_metric" "public"."credit_metric_type", "p_overage_amount" numeric, "p_billing_cycle_start" timestamp with time zone, "p_billing_cycle_end" timestamp with time zone, "p_details" "jsonb") FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."calculate_credit_cost"("p_metric" "public"."credit_metric_type", "p_overage_amount" numeric) FROM "anon";
REVOKE ALL ON FUNCTION "public"."calculate_credit_cost"("p_metric" "public"."credit_metric_type", "p_overage_amount" numeric) FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."top_up_usage_credits"("p_org_id" "uuid", "p_amount" numeric, "p_expires_at" timestamp with time zone, "p_source" "text", "p_source_ref" "jsonb", "p_notes" "text") FROM "anon";
REVOKE ALL ON FUNCTION "public"."top_up_usage_credits"("p_org_id" "uuid", "p_amount" numeric, "p_expires_at" timestamp with time zone, "p_source" "text", "p_source_ref" "jsonb", "p_notes" "text") FROM "authenticated";

-- =============================================================================
-- HTTP/QUEUE INTERNAL FUNCTIONS
-- =============================================================================
REVOKE ALL ON FUNCTION "public"."delete_http_response"("request_id" bigint) FROM "anon";
REVOKE ALL ON FUNCTION "public"."delete_http_response"("request_id" bigint) FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."mass_edit_queue_messages_cf_ids"("updates" "public"."message_update"[]) FROM "anon";
REVOKE ALL ON FUNCTION "public"."mass_edit_queue_messages_cf_ids"("updates" "public"."message_update"[]) FROM "authenticated";

-- =============================================================================
-- PG_LOG FUNCTION (internal debugging - could leak sensitive info)
-- =============================================================================
REVOKE ALL ON FUNCTION "public"."pg_log"("decision" "text", "input" "jsonb") FROM "anon";
REVOKE ALL ON FUNCTION "public"."pg_log"("decision" "text", "input" "jsonb") FROM "authenticated";
