-- Add cron_sync_sub queue and scheduling system

-- Create new message queue for cron_sync_sub
SELECT pgmq.create('cron_sync_sub');

-- Create function to process all organizations for cron_sync_sub
CREATE OR REPLACE FUNCTION "public"."process_cron_sync_sub_jobs" () RETURNS "void" LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    org_record RECORD;
BEGIN
    -- Process each organization that has a customer_id (paying customers only)
    FOR org_record IN 
        SELECT DISTINCT o.id, si.customer_id
        FROM orgs o
        INNER JOIN stripe_info si ON o.customer_id = si.customer_id
        WHERE o.customer_id IS NOT NULL 
          AND si.customer_id IS NOT NULL
    LOOP
        -- Queue sync_sub processing for this organization
        PERFORM pgmq.send('cron_sync_sub',
            json_build_object(
                'function_name', 'cron_sync_sub',
                'orgId', org_record.id,
                'customerId', org_record.customer_id
            )::jsonb
        );
    END LOOP;
END;
$$;

-- Set permissions for the new function
ALTER FUNCTION public.process_cron_sync_sub_jobs() OWNER TO postgres;

-- Revoke all existing permissions first
REVOKE ALL ON FUNCTION public.process_cron_sync_sub_jobs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_cron_sync_sub_jobs() FROM anon;
REVOKE ALL ON FUNCTION public.process_cron_sync_sub_jobs() FROM authenticated;

-- Grant only EXECUTE permission to service_role
GRANT EXECUTE ON FUNCTION public.process_cron_sync_sub_jobs() TO service_role;

-- Create cron job for cron_sync_sub scheduling (daily at 4am)
SELECT cron.schedule(
  'cron_sync_sub_scheduler',
  '0 4 * * *',
  'SELECT public.process_cron_sync_sub_jobs();'
);

-- Create cron job for processing cron_sync_sub queue (every minute) with batch size of 10
SELECT cron.schedule(
  'process_cron_sync_sub_queue',
  '* * * * *',
  'SELECT public.process_function_queue(''cron_sync_sub'', 10)'
);
