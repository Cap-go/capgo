-- Add builder_onboarding preference for users and set default to true
-- (Builder native-build onboarding recovery — separate from the OTA 'onboarding' key)

-- Backfill existing users who already have email_preferences set
UPDATE public.users
SET email_preferences = email_preferences || '{"builder_onboarding": true}'::jsonb
WHERE email_preferences IS NOT NULL
  AND NOT (email_preferences ? 'builder_onboarding');

-- Update the column default to include the new key
ALTER TABLE public.users
ALTER COLUMN email_preferences SET DEFAULT '{"usage_limit": true, "credit_usage": true, "onboarding": true, "builder_onboarding": true, "weekly_stats": true, "monthly_stats": true, "billing_period_stats": true, "deploy_stats_24h": true, "bundle_created": true, "bundle_deployed": true, "device_error": true, "channel_self_rejected": true, "cli_realtime_feed": true}'::jsonb;

COMMENT ON COLUMN public.users.email_preferences IS 'Per-user email notification preferences. Keys: usage_limit, credit_usage, onboarding, builder_onboarding, weekly_stats, monthly_stats, billing_period_stats, deploy_stats_24h, bundle_created, bundle_deployed, device_error, channel_self_rejected, cli_realtime_feed. Values are booleans.';
