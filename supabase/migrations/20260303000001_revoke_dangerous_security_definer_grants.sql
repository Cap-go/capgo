-- =============================================================================
-- Security Fix: Revoke dangerous SECURITY DEFINER function grants
-- =============================================================================
-- Multiple SECURITY DEFINER functions are granted to the 'anon' role without
-- any authentication or authorization checks inside the function body.
-- Since SECURITY DEFINER bypasses RLS, anonymous callers can execute these
-- functions to corrupt billing data, inject build logs, purge data, or
-- read sensitive org metrics for any organization.
--
-- Fix: Revoke access from 'anon' for all affected functions.
-- For backend-only functions (called exclusively by service_role from edge
-- functions/cron), also revoke from 'authenticated'.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- CRITICAL: upsert_version_meta — no auth checks, anon can corrupt billing
-- Backend-only: called from edge functions via service_role
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint) FROM "anon";
REVOKE ALL ON FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint) FROM "authenticated";

-- ---------------------------------------------------------------------------
-- CRITICAL: record_build_time — no auth checks, anon can inject build logs
-- Backend-only: called from edge functions via service_role
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION "public"."record_build_time"("p_org_id" "uuid", "p_user_id" "uuid", "p_build_id" character varying, "p_platform" character varying, "p_build_time_unit" bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."record_build_time"("p_org_id" "uuid", "p_user_id" "uuid", "p_build_id" character varying, "p_platform" character varying, "p_build_time_unit" bigint) FROM "anon";
REVOKE ALL ON FUNCTION "public"."record_build_time"("p_org_id" "uuid", "p_user_id" "uuid", "p_build_id" character varying, "p_platform" character varying, "p_build_time_unit" bigint) FROM "authenticated";

-- ---------------------------------------------------------------------------
-- MEDIUM: delete_old_deleted_versions — cron job exposed as public RPC
-- Backend-only: should only be called by cron/service_role
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION "public"."delete_old_deleted_versions"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."delete_old_deleted_versions"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."delete_old_deleted_versions"() FROM "authenticated";

-- ---------------------------------------------------------------------------
-- HIGH: Information disclosure functions — no auth checks, anon can read
-- any org's metrics, plan info, and usage statistics.
--
-- These ARE called by the frontend (authenticated users), so we only revoke
-- from 'anon' and PUBLIC. The authenticated→any-org cross-tenant issue should
-- be addressed by adding auth.uid() + org membership checks inside each
-- function body (follow-up), as revoking 'authenticated' would break the UI.
-- ---------------------------------------------------------------------------

-- get_app_metrics (2 overloads)
REVOKE ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") FROM "anon";

-- get_plan_usage_percent_detailed (2 overloads)
REVOKE ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid", "cycle_start" "date", "cycle_end" "date") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid", "cycle_start" "date", "cycle_end" "date") FROM "anon";

-- get_current_plan_max_org
REVOKE ALL ON FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") FROM "anon";

-- get_current_plan_name_org
REVOKE ALL ON FUNCTION "public"."get_current_plan_name_org"("orgid" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_current_plan_name_org"("orgid" "uuid") FROM "anon";

-- get_total_storage_size_org
REVOKE ALL ON FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") FROM "anon";

-- get_total_app_storage_size_orgs
REVOKE ALL ON FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) FROM "anon";

-- is_good_plan_v5_org
REVOKE ALL ON FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") FROM "anon";
