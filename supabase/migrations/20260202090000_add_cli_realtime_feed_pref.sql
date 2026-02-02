-- Add cli_realtime_feed preference for users and set default to true

-- Backfill cli_realtime_feed preference for existing users who have email_preferences set
UPDATE public.users
SET email_preferences = email_preferences || '{"cli_realtime_feed": true}'::jsonb
WHERE email_preferences IS NOT NULL
  AND NOT (email_preferences ? 'cli_realtime_feed');

-- Update the default value for email_preferences on users table
ALTER TABLE public.users
ALTER COLUMN email_preferences SET DEFAULT '{
  "usage_limit": true,
  "credit_usage": true,
  "onboarding": true,
  "weekly_stats": true,
  "monthly_stats": true,
  "billing_period_stats": true,
  "deploy_stats_24h": true,
  "bundle_created": true,
  "bundle_deployed": true,
  "device_error": true,
  "channel_self_rejected": true,
  "cli_realtime_feed": true
}'::jsonb;

-- Update column comments
COMMENT ON COLUMN public.users.email_preferences IS 'Per-user email notification preferences. Keys: usage_limit, credit_usage, onboarding, weekly_stats, monthly_stats, billing_period_stats, deploy_stats_24h, bundle_created, bundle_deployed, device_error, channel_self_rejected, cli_realtime_feed. Values are booleans.';
