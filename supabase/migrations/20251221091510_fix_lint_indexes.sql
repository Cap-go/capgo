-- Add missing foreign key indexes
CREATE INDEX IF NOT EXISTS idx_build_logs_user_id ON public.build_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_build_requests_requested_by ON public.build_requests (requested_by);

-- Drop unused indexes (excluding devices/stats tables)
DROP INDEX IF EXISTS idx_capgo_credits_steps_org_id;
DROP INDEX IF EXISTS idx_usage_overage_events_credit_step_id;
DROP INDEX IF EXISTS idx_app_versions_key_id;
DROP INDEX IF EXISTS capgo_credits_steps_range_idx;
DROP INDEX IF EXISTS deploy_history_app_version_idx;
DROP INDEX IF EXISTS deploy_history_channel_deployed_idx;
DROP INDEX IF EXISTS finx_apps_user_id;
DROP INDEX IF EXISTS finx_orgs_created_by;
DROP INDEX IF EXISTS idx_app_id_id_app_versions_meta;
DROP INDEX IF EXISTS idx_app_id_public_channel;
DROP INDEX IF EXISTS idx_daily_bandwidth_app_id_date;
DROP INDEX IF EXISTS idx_daily_storage_app_id_date;
DROP INDEX IF EXISTS idx_deleted_apps_app_id;
DROP INDEX IF EXISTS idx_deleted_apps_deleted_at;
DROP INDEX IF EXISTS idx_deleted_apps_owner_org;
DROP INDEX IF EXISTS idx_deploy_history_created_by;
DROP INDEX IF EXISTS idx_stripe_info_customer_id;
DROP INDEX IF EXISTS idx_stripe_info_status_plan;
DROP INDEX IF EXISTS idx_usage_credit_consumptions_grant;
DROP INDEX IF EXISTS idx_usage_credit_consumptions_org_time;
DROP INDEX IF EXISTS idx_usage_credit_grants_org_expires;
DROP INDEX IF EXISTS idx_usage_credit_grants_org_remaining;
DROP INDEX IF EXISTS idx_usage_credit_transactions_grant;
DROP INDEX IF EXISTS idx_usage_credit_transactions_org_time;
DROP INDEX IF EXISTS orgs_updated_at_id_idx;
