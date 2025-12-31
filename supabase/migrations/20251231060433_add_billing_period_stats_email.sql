-- Add billing period stats email functionality
-- This email is sent on each organization's billing anniversary date (renewal day)
-- with their usage stats for the billing period

-- Add billing_period_stats preference to existing email_preferences
-- Set it to true by default for all existing users and orgs
UPDATE public.users
SET email_preferences = email_preferences || '{"billing_period_stats": true}'::jsonb
WHERE email_preferences IS NOT NULL
  AND NOT (email_preferences ? 'billing_period_stats');

UPDATE public.orgs
SET email_preferences = email_preferences || '{"billing_period_stats": true}'::jsonb
WHERE email_preferences IS NOT NULL
  AND NOT (email_preferences ? 'billing_period_stats');

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
  "channel_self_rejected": true
}'::jsonb;

-- Update the default value for email_preferences on orgs table
ALTER TABLE public.orgs
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
  "channel_self_rejected": true
}'::jsonb;

-- Update column comments
COMMENT ON COLUMN public.users.email_preferences IS 'Per-user email notification preferences. Keys: usage_limit, credit_usage, onboarding, weekly_stats, monthly_stats, billing_period_stats, deploy_stats_24h, bundle_created, bundle_deployed, device_error, channel_self_rejected. Values are booleans.';
COMMENT ON COLUMN public.orgs.email_preferences IS 'JSONB object containing email notification preferences for the organization. When enabled, emails are also sent to the management_email if it differs from admin user emails. Keys: usage_limit, credit_usage, onboarding, weekly_stats, monthly_stats, billing_period_stats, deploy_stats_24h, bundle_created, bundle_deployed, device_error, channel_self_rejected. All default to true.';

-- Create the function to process billing period stats emails
-- This function finds all orgs whose billing cycle ends TODAY and queues emails for them
CREATE OR REPLACE FUNCTION public.process_billing_period_stats_email() RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  org_record RECORD;
  cycle_end_date date;
BEGIN
  -- Find all orgs whose billing cycle ends today
  -- The billing cycle end date is calculated based on subscription_anchor_start
  FOR org_record IN (
    SELECT
      o.id AS org_id,
      o.management_email,
      si.subscription_anchor_start
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    WHERE si.status = 'succeeded'
      AND o.management_email IS NOT NULL
  )
  LOOP
    -- Calculate when this org's billing cycle ends
    -- Using the same logic as get_cycle_info_org
    DECLARE
      anchor_day INTERVAL;
      cycle_start_date date;
    BEGIN
      -- Extract the day of month from subscription_anchor_start as an INTERVAL
      anchor_day := COALESCE(
        org_record.subscription_anchor_start - date_trunc('MONTH', org_record.subscription_anchor_start),
        '0 DAYS'::INTERVAL
      );

      -- Determine the start date based on the anchor day and current date
      IF anchor_day > now() - date_trunc('MONTH', now()) THEN
        cycle_start_date := (date_trunc('MONTH', now() - INTERVAL '1 MONTH') + anchor_day)::date;
      ELSE
        cycle_start_date := (date_trunc('MONTH', now()) + anchor_day)::date;
      END IF;

      -- Calculate end date (one month after start)
      cycle_end_date := (cycle_start_date + INTERVAL '1 MONTH')::date;

      -- If today is the billing cycle end date, queue the email
      IF cycle_end_date = CURRENT_DATE THEN
        PERFORM pgmq.send('cron_email',
          jsonb_build_object(
            'function_name', 'cron_email',
            'function_type', 'cloudflare',
            'payload', jsonb_build_object(
              'email', org_record.management_email,
              'orgId', org_record.org_id,
              'type', 'billing_period_stats'
            )
          )
        );
      END IF;
    END;
  END LOOP;
END;
$$;

-- Security: internal function only
REVOKE EXECUTE ON FUNCTION public.process_billing_period_stats_email() FROM public;
GRANT EXECUTE ON FUNCTION public.process_billing_period_stats_email() TO service_role;

-- Add the cron task to run daily at 12:00 UTC
INSERT INTO public.cron_tasks (
    name,
    description,
    task_type,
    target,
    batch_size,
    second_interval,
    minute_interval,
    hour_interval,
    run_at_hour,
    run_at_minute,
    run_at_second,
    run_on_dow,
    run_on_day
) VALUES (
    'billing_period_stats_email',
    'Process billing period stats email for orgs on their renewal day',
    'function',
    'public.process_billing_period_stats_email()',
    null, null, null, null, 12, 0, 0, null, null
)
ON CONFLICT (name) DO NOTHING;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.process_billing_period_stats_email() TO anon;
GRANT EXECUTE ON FUNCTION public.process_billing_period_stats_email() TO authenticated;
