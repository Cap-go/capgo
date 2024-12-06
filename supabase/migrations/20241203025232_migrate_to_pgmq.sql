-- First, drop existing queue-related functions and tables
DROP FUNCTION IF EXISTS "public"."process_current_jobs_if_unlocked";
DROP FUNCTION IF EXISTS "public"."process_requested_jobs";
DROP FUNCTION IF EXISTS "public"."http_post_helper";
DROP FUNCTION IF EXISTS "public"."delete_failed_jobs";
DROP FUNCTION IF EXISTS "public"."retry_failed_jobs";

-- Drop existing queue tables
DROP TABLE IF EXISTS "public"."job_queue";
DROP TABLE IF EXISTS "public"."workers";

-- Drop queue-related types
DROP TYPE IF EXISTS "public"."queue_job_status";

-- Remove existing cron jobs
SELECT cron.unschedule('process_requests_from_queue');
SELECT cron.unschedule('process_current_jobs_if_unlocked');
SELECT cron.unschedule('delete_failed_jobs');

-- Create pgmq extension if not exists
CREATE EXTENSION IF NOT EXISTS "pgmq";

-- Create PGMQ message type
DO $$ BEGIN
    CREATE TYPE pgmq.message AS (
        msg_id bigint,
        message text,
        read_ct int,
        enqueued_at timestamptz,
        last_attempted_at timestamptz,
        processed_at timestamptz,
        visible_at timestamptz
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create queues for table event replication
SELECT pgmq.create('table_events');

-- Create queues for specific functions
SELECT pgmq.create('cron_stats');
SELECT pgmq.create('cron_plan');
SELECT pgmq.create('cron_clear_versions');
SELECT pgmq.create('cron_email');
SELECT pgmq.create('on_app_create');
SELECT pgmq.create('on_channel_update');
SELECT pgmq.create('on_organization_create');
SELECT pgmq.create('on_organization_delete');
SELECT pgmq.create('on_user_create');
SELECT pgmq.create('on_user_update');
SELECT pgmq.create('on_version_create');
SELECT pgmq.create('on_version_delete');
SELECT pgmq.create('on_version_update');

-- Create new helper function for sending messages to queues
CREATE OR REPLACE FUNCTION "public"."queue_message"("queue_name" text, "message" jsonb)
RETURNS bigint
LANGUAGE "plpgsql"
SECURITY DEFINER
AS $$
BEGIN
    RETURN (SELECT pgmq.send(queue_name, message));
END;
$$;

-- Update trigger function to use new queue system
CREATE OR REPLACE FUNCTION "public"."trigger_http_queue_post_to_function"()
RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY DEFINER
AS $$
DECLARE 
  payload jsonb;
  queue_name text;
BEGIN 
  -- Build the base payload
  payload := jsonb_build_object(
    'old_record', OLD, 
    'record', NEW, 
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'function_name', TG_ARGV[0],
    'function_type', TG_ARGV[1]
  );

  -- Send to table_events queue for replication
  PERFORM queue_message('table_events', payload);
  
  -- Also send to function-specific queue
  queue_name := TG_ARGV[0];
  IF queue_name IS NOT NULL THEN
    PERFORM queue_message(queue_name, payload);
  END IF;

  RETURN NEW;
END;
$$;

-- Set appropriate permissions
REVOKE ALL ON FUNCTION "public"."queue_message"("queue_name" text, "message" jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."queue_message"("queue_name" text, "message" jsonb) TO "service_role";

-- Update other functions that were using the old queue system
CREATE OR REPLACE FUNCTION "public"."process_cron_stats_jobs"()
RETURNS "void"
LANGUAGE "plpgsql"
AS $$
DECLARE
  app_record RECORD;
BEGIN
  FOR app_record IN (
    SELECT DISTINCT av.app_id, av.owner_org
    FROM app_versions av
    WHERE av.created_at >= NOW() - INTERVAL '30 days'
    
    UNION
    
    SELECT DISTINCT dm.app_id, av.owner_org
    FROM daily_mau dm
    JOIN app_versions av ON dm.app_id = av.app_id
    WHERE dm.date >= NOW() - INTERVAL '30 days' AND dm.mau > 0
  )
  LOOP
    PERFORM queue_message('cron_stats', 
      jsonb_build_object(
        'function_name', 'cron_stats',
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

-- Update process_subscribed_orgs function
CREATE OR REPLACE FUNCTION "public"."process_subscribed_orgs"()
RETURNS "void"
LANGUAGE "plpgsql"
AS $$
DECLARE
  org_record RECORD;
BEGIN
  FOR org_record IN (
    SELECT o.id, o.customer_id
    FROM orgs o
    JOIN stripe_info si ON o.customer_id = si.customer_id
    WHERE si.status = 'succeeded' AND si.product_id != 'free'
  )
  LOOP
    PERFORM queue_message('cron_plan',
      jsonb_build_object(
        'function_name', 'cron_plan',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object(
          'orgId', org_record.id,
          'customerId', org_record.customer_id
        )
      )
    );
  END LOOP;
END;
$$;

-- Add consumer functions for each queue
CREATE OR REPLACE FUNCTION "public"."process_function_queue"(queue_name text)
RETURNS "void"
LANGUAGE "plpgsql"
SECURITY DEFINER
AS $$
DECLARE
    msg pgmq.message;
    payload jsonb;
    response http_response;
    url text;
BEGIN
    -- Read up to 100 messages at a time
    FOR msg IN SELECT * FROM pgmq.read(queue_name, 60, 200)
    LOOP
        BEGIN
            payload := msg.message::jsonb;
            
            -- Determine URL based on function type
            CASE payload->>'function_type'
                WHEN 'netlify' THEN
                    url := get_netlify_function_url() || '/triggers/' || payload->>'function_name';
                WHEN 'cloudflare' THEN
                    url := get_cloudflare_function_url() || '/triggers/' || payload->>'function_name';
                ELSE
                    url := get_db_url() || '/functions/v1/triggers/' || payload->>'function_name';
            END CASE;

            -- Make HTTP request
            SELECT * INTO response FROM http((
                'POST',
                url,
                ARRAY[http_header('Content-Type', 'application/json'), http_header('apisecret', get_apikey())],
                'application/json',
                payload::text
            )::http_request);

            -- Check response
            IF response.status >= 200 AND response.status < 300 THEN
                -- Success - archive the message
                PERFORM pgmq.archive(queue_name, msg.msg_id);
            ELSE
                -- Failed - return to queue for retry
                PERFORM pgmq.return(queue_name, msg.msg_id, 'failed with status ' || response.status);
            END IF;

        EXCEPTION WHEN OTHERS THEN
            -- Return message to queue on error
            PERFORM pgmq.return(queue_name, msg.msg_id, SQLERRM);
        END;
    END LOOP;
END;
$$;

-- Schedule cron jobs for consumers
SELECT cron.schedule(
    'process_table_events',
    '* * * * *',
    $$SELECT process_function_queue('table_events');$$
);

-- Schedule cron jobs for each function queue
SELECT cron.schedule(
    'process_cron_stats_queue',
    '* * * * *',
    $$SELECT process_function_queue('cron_stats');$$
);

SELECT cron.schedule(
    'process_cron_plan_queue',
    '* * * * *',
    $$SELECT process_function_queue('cron_plan');$$
);

SELECT cron.schedule(
    'process_cron_clear_versions_queue',
    '* * * * *',
    $$SELECT process_function_queue('cron_clear_versions');$$
);

SELECT cron.schedule(
    'process_cron_email_queue',
    '* * * * *',
    $$SELECT process_function_queue('cron_email');$$
);

-- Schedule event triggers queues
SELECT cron.schedule(
    'process_app_events_queue',
    '* * * * *',
    $$SELECT process_function_queue('on_app_create');$$
);

SELECT cron.schedule(
    'process_channel_update_queue',
    '* * * * *',
    $$SELECT process_function_queue('on_channel_update');$$
);

SELECT cron.schedule(
    'process_organization_create_queue',
    '* * * * *',
    $$SELECT process_function_queue('on_organization_create');$$
);

SELECT cron.schedule(
    'process_organization_delete_queue',
    '* * * * *',
    $$SELECT process_function_queue('on_organization_delete');$$
);

SELECT cron.schedule(
    'process_user_create_queue',
    '* * * * *',
    $$SELECT process_function_queue('on_user_create');$$
);

SELECT cron.schedule(
    'process_user_update_queue',
    '* * * * *',
    $$SELECT process_function_queue('on_user_update');$$
);

SELECT cron.schedule(
    'process_version_create_queue',
    '* * * * *',
    $$SELECT process_function_queue('on_version_create');$$
);

SELECT cron.schedule(
    'process_version_delete_queue',
    '* * * * *',
    $$SELECT process_function_queue('on_version_delete');$$
);

SELECT cron.schedule(
    'process_version_update_queue',
    '* * * * *',
    $$SELECT process_function_queue('on_version_update');$$
);

-- Set permissions
REVOKE ALL ON FUNCTION "public"."process_function_queue"("queue_name" text) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_function_queue"("queue_name" text) TO "service_role";


-- Function to clean up old messages
CREATE OR REPLACE FUNCTION "public"."cleanup_queue_messages"()
RETURNS "void"
LANGUAGE "plpgsql"
SECURITY DEFINER
AS $$
DECLARE
    queue_name text;
BEGIN
    -- Clean up messages older than 7 days from all queues
    FOR queue_name IN (
        SELECT name FROM pgmq.list_queues()
    ) LOOP
        -- Delete archived messages older than 7 days
        PERFORM pgmq.delete_archived(queue_name, (NOW() - INTERVAL '7 days')::timestamptz);
        
        -- Delete failed messages that have been retried more than 5 times
        PERFORM pgmq.delete_msg(
            queue_name,
            msg_id
        ) FROM pgmq.get_queue(queue_name) 
        WHERE read_ct > 5;
    END LOOP;
END;
$$;

-- Set permissions for cleanup function
REVOKE ALL ON FUNCTION "public"."cleanup_queue_messages"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_queue_messages"() TO "service_role";

-- Schedule cleanup job
SELECT cron.schedule(
    'cleanup_queue_messages',
    '0 0 * * *',  -- Run at midnight every day
    $$SELECT cleanup_queue_messages();$$
);
