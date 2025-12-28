-- Migration: Add granular email notification preferences per user
-- This allows users to opt in/out of specific email notification types

-- Add JSONB column for granular email preferences to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS email_preferences jsonb DEFAULT '{
  "usage_limit": true,
  "credit_usage": true,
  "onboarding": true,
  "weekly_stats": true,
  "monthly_stats": true,
  "deploy_stats_24h": true,
  "bundle_created": true,
  "bundle_deployed": true,
  "device_error": true
}'::jsonb NOT NULL;

-- Index for performance when filtering by preferences
CREATE INDEX IF NOT EXISTS idx_users_email_preferences ON public.users USING gin (email_preferences);

-- Add comment describing the column
COMMENT ON COLUMN public.users.email_preferences IS 'Per-user email notification preferences. Keys: usage_limit, credit_usage, onboarding, weekly_stats, monthly_stats, deploy_stats_24h, bundle_created, bundle_deployed, device_error. Values are booleans.';
