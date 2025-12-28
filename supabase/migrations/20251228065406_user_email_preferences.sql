-- Migration: Add granular email notification preferences for users and organizations
-- This allows users and organizations to opt in/out of specific email notification types

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

-- Add email_preferences JSONB column to orgs table
-- This allows organizations to control which email notifications are sent to the org's management email
-- The management_email is used for billing/invoice emails and can optionally receive other notifications
ALTER TABLE public.orgs
ADD COLUMN IF NOT EXISTS email_preferences jsonb NOT NULL DEFAULT '{
  "usage_limit": true,
  "credit_usage": true,
  "onboarding": true,
  "weekly_stats": true,
  "monthly_stats": true,
  "deploy_stats_24h": true,
  "bundle_created": true,
  "bundle_deployed": true,
  "device_error": true
}'::jsonb;

-- Add GIN index for efficient JSONB queries on orgs
CREATE INDEX IF NOT EXISTS idx_orgs_email_preferences ON public.orgs USING GIN (email_preferences);

-- Add comment explaining the column
COMMENT ON COLUMN public.orgs.email_preferences IS 'JSONB object containing email notification preferences for the organization. When enabled, emails are also sent to the management_email if it differs from admin user emails. Keys: usage_limit, credit_usage, onboarding, weekly_stats, monthly_stats, deploy_stats_24h, bundle_created, bundle_deployed, device_error. All default to true.';
