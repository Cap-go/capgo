-- Note: already applied to production
DROP FUNCTION IF EXISTS public.process_function_queue (text);

CREATE OR REPLACE FUNCTION "public"."process_cron_stats_jobs" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
DECLARE
  app_record RECORD;
BEGIN
  FOR app_record IN (
    SELECT DISTINCT av.app_id, av.owner_org
    FROM public.app_versions av
    WHERE av.created_at >= NOW() - INTERVAL '30 days'

    UNION

    SELECT DISTINCT dm.app_id, av.owner_org
    FROM public.daily_mau dm
    JOIN public.app_versions av ON dm.app_id = av.app_id
    WHERE dm.date >= NOW() - INTERVAL '30 days' AND dm.mau > 0
  )
  LOOP
    PERFORM pgmq.send('cron_stat_app',
      jsonb_build_object(
        'function_name', 'cron_stat_app',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object(
          'appId', app_record.app_id,
          'orgId', app_record.owner_org,
          'todayOnly', false
        )
      )
    );
  END LOOP;
END;
$$;

SELECT
  cron.unschedule ('process_cron_stat_app_queue');

SELECT
  cron.schedule (
    'process_cron_stat_app_queue',
    '* * * * *',
    'SELECT public.process_function_queue(''cron_stat_app'', 10)'
  );

CREATE OR REPLACE FUNCTION public.queue_cron_stat_org_for_org (org_id uuid, customer_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
BEGIN

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
END;
$$;

SELECT
  cron.unschedule ('process_cron_stat_org_queue');

SELECT
  cron.schedule (
    'process_cron_stat_org_queue',
    '*/5 * * * *',
    'SELECT public.process_function_queue(''cron_stat_org'', 10)'
  );
