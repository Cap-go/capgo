-- Remove the daily process_subscribed_orgs cron job
SELECT cron.unschedule('process_subscribed_orgs');

-- Remove the current process_cron_plan_queue job
SELECT cron.unschedule('process_cron_plan_queue');

-- Reschedule process_cron_plan_queue to run every minute instead of every 2 hours
SELECT cron.schedule(
  'process_cron_plan_queue',
  '* * * * *',
  'SELECT public.process_function_queue(''cron_plan'')'
);

-- Add column to track when plan was last calculated
ALTER TABLE public.stripe_info ADD COLUMN IF NOT EXISTS plan_calculated_at timestamp with time zone;

-- Update the queue function to check if plan was calculated in the last hour
CREATE OR REPLACE FUNCTION public.queue_cron_stat_org_for_org(org_id uuid, customer_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  last_calculated timestamptz;
BEGIN
  -- Check when plan was last calculated for this customer
  SELECT plan_calculated_at INTO last_calculated
  FROM public.stripe_info
  WHERE stripe_info.customer_id = queue_cron_stat_org_for_org.customer_id;
  
  -- Only queue if plan wasn't calculated in the last hour
  IF last_calculated IS NULL OR last_calculated < NOW() - INTERVAL '1 hour' THEN
    PERFORM pgmq.send('cron_plan',
      jsonb_build_object(
        'function_name', 'cron_plan',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object(
          'orgId', org_id,
          'customerId', customer_id
        )
      )
    );
  END IF;
END;
$$;


ALTER FUNCTION public.queue_cron_stat_org_for_org(uuid, text) OWNER TO postgres;

-- Revoke all permissions first, then grant only to service_role
REVOKE ALL ON FUNCTION public.queue_cron_stat_org_for_org(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.queue_cron_stat_org_for_org(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.queue_cron_stat_org_for_org(uuid, text) FROM authenticated;
GRANT ALL ON FUNCTION public.queue_cron_stat_org_for_org(uuid, text) TO service_role;