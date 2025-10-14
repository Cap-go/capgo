-- Simple renaming of cron_stats to cron_stat_app and cron_plan to cron_stat_org

-- Unschedule existing cron jobs
SELECT cron.unschedule('process_cron_stats_queue');
SELECT cron.unschedule('process_cron_stats_jobs');
SELECT cron.unschedule('process_cron_plan_queue');

-- Rename the message queues
SELECT pgmq.drop_queue('cron_stats');
SELECT pgmq.drop_queue('cron_plan');
SELECT pgmq.create('cron_stat_app');
SELECT pgmq.create('cron_stat_org');

-- Reschedule the cron jobs with new queue names
SELECT cron.schedule(
  'process_cron_stat_app_jobs',
  '0 */6 * * *',
  'SELECT process_cron_stats_jobs();'
);

SELECT cron.schedule(
  'process_cron_stat_app_queue',
  '* * * * *',
  'SELECT public.process_function_queue(''cron_stat_app'')'
);

SELECT cron.schedule(
  'process_cron_stat_org_queue',
  '* * * * *',
  'SELECT public.process_function_queue(''cron_stat_org'')'
);

-- Update the queue_cron_plan_for_org function to use the new queue name
CREATE OR REPLACE FUNCTION public.queue_cron_plan_for_org(org_id uuid, customer_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  last_calculated timestamptz;
BEGIN
  -- Check when plan was last calculated for this customer
  SELECT plan_calculated_at INTO last_calculated
  FROM public.stripe_info
  WHERE stripe_info.customer_id = queue_cron_plan_for_org.customer_id;
  
  -- Only queue if plan wasn't calculated in the last hour
  IF last_calculated IS NULL OR last_calculated < NOW() - INTERVAL '1 hour' THEN
    PERFORM pgmq.send('cron_stat_org',
      jsonb_build_object(
        'function_name', 'cron_stat_org',
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