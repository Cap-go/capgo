-- First, drop existing queue-related functions and tables
DROP FUNCTION IF EXISTS "public"."process_current_jobs_if_unlocked";
DROP FUNCTION IF EXISTS "public"."process_requested_jobs";
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
SELECT cron.unschedule('retry_failed_jobs');

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

-- Create PGMQ queues
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
SELECT pgmq.create('replicate_data');
SELECT pgmq.create('http_responses');


-- Update process_cron_stats_jobs function
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
    PERFORM pgmq.send('cron_stats', 
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
    PERFORM pgmq.send('cron_plan',
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
RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
AS $$
DECLARE
    msg record;
    payload jsonb;
    request_id bigint;
BEGIN
    -- Read messages
    FOR msg IN SELECT * FROM pgmq.read(queue_name, 60, 200)
    LOOP
        BEGIN
            -- Parse message as JSONB
            payload := msg.message::jsonb;
            
            -- Send request and queue response handling
            SELECT http_post_helper(
                payload->>'function_name',
                payload->>'function_type',
                payload->'payload'
            ) INTO request_id;
            
            -- Queue response handling
            PERFORM pgmq.send('http_responses', jsonb_build_object(
                'request_id', request_id,
                'queue_name', queue_name,
                'msg_id', msg.msg_id,
                'read_ct', msg.read_ct
            ));
            
            -- Set visibility timeout
            PERFORM pgmq.set_vt(queue_name, msg.msg_id, 30);

        EXCEPTION WHEN OTHERS THEN
            -- On error, if max retries reached archive, otherwise retry
            IF msg.read_ct >= 5 THEN
                PERFORM pgmq.archive(queue_name, msg.msg_id);
            ELSE
                PERFORM pgmq.set_vt(queue_name, msg.msg_id, 30);
            END IF;
        END;
    END LOOP;
END;
$$;

-- Add function to process responses
CREATE OR REPLACE FUNCTION "public"."process_http_responses"()
RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
AS $$
DECLARE
    msg record;
    response record;
BEGIN
    -- Process responses
    FOR msg IN SELECT * FROM pgmq.read('http_responses', 60, 200)
    LOOP
        -- Get HTTP response
        SELECT * INTO response 
        FROM net._http_response 
        WHERE id = (msg.message::jsonb->>'request_id')::bigint
        AND (status_code IS NOT NULL OR error_msg IS NOT NULL);
        
        -- Skip if response not ready
        CONTINUE WHEN NOT FOUND;
        
        -- Handle response
        IF response.error_msg IS NULL AND response.status_code >= 200 AND response.status_code < 300 THEN
            -- Success - delete both messages
            PERFORM pgmq.delete(msg.message::jsonb->>'queue_name', (msg.message::jsonb->>'msg_id')::bigint);
            PERFORM pgmq.delete('http_responses', msg.msg_id);
        ELSE
            -- Failed - if max retries reached archive, otherwise retry
            IF (msg.message::jsonb->>'read_ct')::int >= 5 THEN
                PERFORM pgmq.archive(msg.message::jsonb->>'queue_name', (msg.message::jsonb->>'msg_id')::bigint);
                PERFORM pgmq.delete('http_responses', msg.msg_id);
            ELSE
                -- Delete old response message
                PERFORM pgmq.delete('http_responses', msg.msg_id);
                -- Set original message for retry
                PERFORM pgmq.set_vt(
                    msg.message::jsonb->>'queue_name',
                    (msg.message::jsonb->>'msg_id')::bigint,
                    1
                );
            END IF;
        END IF;
    END LOOP;
END;
$$;

-- Schedule response processing
SELECT cron.schedule(
    'process_http_responses',
    '5 seconds',
    $$SELECT process_http_responses();$$
);

-- Schedule cron jobs for consumers

-- Schedule cron jobs for each function queue
SELECT cron.schedule(
    'process_cron_stats_queue',
    '5 seconds',
    $$SELECT process_function_queue('cron_stats');$$
);

SELECT cron.schedule(
    'process_cron_plan_queue',
    '5 seconds',
    $$SELECT process_function_queue('cron_plan');$$
);

SELECT cron.schedule(
    'process_cron_clear_versions_queue',
    '5 seconds',
    $$SELECT process_function_queue('cron_clear_versions');$$
);

SELECT cron.schedule(
    'process_cron_email_queue',
    '5 seconds',
    $$SELECT process_function_queue('cron_email');$$
);

-- Schedule event triggers queues
SELECT cron.schedule(
    'process_app_events_queue',
    '5 seconds',
    $$SELECT process_function_queue('on_app_create');$$
);

SELECT cron.schedule(
    'process_channel_update_queue',
    '5 seconds',
    $$SELECT process_function_queue('on_channel_update');$$
);

SELECT cron.schedule(
    'process_organization_create_queue',
    '5 seconds',
    $$SELECT process_function_queue('on_organization_create');$$
);

SELECT cron.schedule(
    'process_organization_delete_queue',
    '5 seconds',
    $$SELECT process_function_queue('on_organization_delete');$$
);

SELECT cron.schedule(
    'process_user_create_queue',
    '5 seconds',
    $$SELECT process_function_queue('on_user_create');$$
);

SELECT cron.schedule(
    'process_user_update_queue',
    '5 seconds',
    $$SELECT process_function_queue('on_user_update');$$
);

SELECT cron.schedule(
    'process_version_create_queue',
    '5 seconds',
    $$SELECT process_function_queue('on_version_create');$$
);

SELECT cron.schedule(
    'process_version_delete_queue',
    '5 seconds',
    $$SELECT process_function_queue('on_version_delete');$$
);

SELECT cron.schedule(
    'process_version_update_queue',
    '5 seconds',
    $$SELECT process_function_queue('on_version_update');$$
);

-- Schedule D1 replication queue
SELECT cron.schedule(
    'process_replicate_data_queue',
    '5 seconds',
    $$SELECT process_function_queue('replicate_data');$$
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

-- Replace trigger function to batch D1 replication
CREATE OR REPLACE FUNCTION "public"."trigger_http_queue_post_to_function_d1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Queue the operation for batch processing
    PERFORM pgmq.send('replicate_data', 
        jsonb_build_object(
            'record', to_jsonb(NEW),
            'old_record', to_jsonb(OLD),
            'type', TG_OP,
            'table', TG_TABLE_NAME
        )
    );
    RETURN NEW;
END;
$$;

-- Add new function to process batched D1 operations
CREATE OR REPLACE FUNCTION "public"."process_d1_replication_batch"()
RETURNS "void"
LANGUAGE "plpgsql"
SECURITY DEFINER
AS $$
DECLARE
    msg record;
    batch_operations jsonb[];
    batch_size int := 10000;
    request_id bigint;
BEGIN
    batch_operations := array[]::jsonb[];
    
    -- Read messages in batch
    FOR msg IN 
        SELECT * FROM pgmq.read('replicate_data', 60, batch_size)
    LOOP
        -- Add operation to batch
        batch_operations := array_append(batch_operations, msg.message::jsonb);        
    END LOOP;
    
    -- Process batch if we have any operations
    IF array_length(batch_operations, 1) > 0 THEN
        -- Send request using http_post_helper
        SELECT http_post_helper(
            'replicate_data',
            'cloudflare',
            jsonb_build_object('operations', batch_operations)
        ) INTO request_id;

        -- Queue response handling
        PERFORM pgmq.send('http_responses', jsonb_build_object(
            'request_id', request_id,
            'queue_name', 'replicate_data',
            'msg_id', msg.msg_id,
            'read_ct', msg.read_ct
        ));
    END IF;
END;
$$;

-- Set permissions
REVOKE ALL ON FUNCTION "public"."process_d1_replication_batch"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_d1_replication_batch"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."trigger_http_queue_post_to_function_d1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_http_queue_post_to_function_d1"() TO "postgres";

-- Schedule batch processing
SELECT cron.schedule(
    'process_d1_replication_batch',
    '5 seconds',
    $$SELECT process_d1_replication_batch();$$
);

-- Update trigger_http_queue_post_to_function function
CREATE OR REPLACE FUNCTION "public"."trigger_http_queue_post_to_function"()
RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY DEFINER
AS $$
DECLARE 
  payload jsonb;
BEGIN 
  -- Build the base payload
  payload := jsonb_build_object(
    'function_name', TG_ARGV[0],
    'function_type', TG_ARGV[1],
    'payload', jsonb_build_object(
      'old_record', OLD, 
      'record', NEW, 
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA
    )
  );
  
  -- Also send to function-specific queue
  IF TG_ARGV[0] IS NOT NULL THEN
    PERFORM pgmq.send(TG_ARGV[0], payload);
  END IF;
  RETURN NEW;
END;
$$;

-- Add process_failed_uploads function
CREATE OR REPLACE FUNCTION "public"."process_failed_uploads"()
RETURNS "void"
LANGUAGE "plpgsql"
AS $$
DECLARE
  failed_version RECORD;
BEGIN
  FOR failed_version IN (
    SELECT * FROM get_versions_with_no_metadata()
  )
  LOOP
    PERFORM pgmq.send('cron_clear_versions',
      jsonb_build_object(
        'function_name', 'cron_clear_versions',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object('version', failed_version)
      )
    );
  END LOOP;
END;
$$;

-- Add process_stats_email function
CREATE OR REPLACE FUNCTION "public"."process_stats_email"()
RETURNS "void"
LANGUAGE "plpgsql"
AS $$
DECLARE
  app_record RECORD;
BEGIN
  FOR app_record IN (
    SELECT a.app_id, o.management_email
    FROM apps a
    JOIN orgs o ON a.owner_org = o.id
  )
  LOOP
    PERFORM pgmq.send('cron_email',
      jsonb_build_object(
        'function_name', 'cron_email',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object(
          'email', app_record.management_email,
          'appId', app_record.app_id
        )
      )
    );
  END LOOP;
END;
$$;
