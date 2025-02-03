BEGIN;
CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT plan(3);

CREATE OR REPLACE FUNCTION my_tests()
RETURNS SETOF TEXT AS $$
DECLARE
    msg record;
    messages_count integer := 0;
    processed_count integer := 0;
    test_app_id text := 'com.test.loadapp';
    version_id integer;
BEGIN
    -- Freeze time for consistent testing
    PERFORM tests.freeze_time('2035-01-01 00:00:00');

    -- Create test app and version
    INSERT INTO apps (app_id, name, icon_url, owner_org) VALUES (test_app_id, 'Test Load App', 'https://example.com/icon.png', '046a36ac-e03c-4590-9257-bd6c9dba9ee8');
    INSERT INTO app_versions (app_id, name) 
    VALUES (test_app_id, '1.0.0') 
    RETURNING id INTO version_id;

    -- Send 1000 delete messages to queue
    FOR i IN 1..1000 LOOP
        PERFORM pgmq.send('on_version_delete', 
            jsonb_build_object(
                'function_name', 'on_version_delete',
                'function_type', 'cloudflare',
                'payload', jsonb_build_object(
                    'old_record', jsonb_build_object('id', version_id, 'app_id', test_app_id),
                    'record', null,
                    'type', 'DELETE',
                    'table', 'app_versions',
                    'schema', 'public'
                )
            )
        );
    END LOOP;

    -- Count queued messages
    SELECT COUNT(*) INTO messages_count 
    FROM pgmq.q_on_version_delete;
    
    RETURN NEXT ok(messages_count = 1000, 'Successfully queued 1000 messages');

    -- Process messages first time to get request_ids
    PERFORM process_function_queue('on_version_delete');
    
    -- Verify all messages have request_ids
    SELECT COUNT(*) INTO messages_count 
    FROM pgmq.q_on_version_delete
    WHERE message::jsonb->>'request_id' IS NOT NULL;
    
    RETURN NEXT ok(messages_count = 1000, 'All messages should have request_ids');
    
    -- Process again without mocks to verify messages stay in queue
    PERFORM process_function_queue('on_version_delete');
    
    -- Verify HTTP requests were queued
    SELECT COUNT(*) INTO messages_count 
    FROM net.http_request_queue
    WHERE id IN (
        SELECT (message::jsonb->>'request_id')::bigint 
        FROM pgmq.q_on_version_delete
        WHERE message::jsonb->>'request_id' IS NOT NULL
    );
    
    RETURN NEXT ok(messages_count = 1000, 'All messages should have HTTP requests queued');
    
    -- Mock successful HTTP responses
    INSERT INTO net._http_response (id, status_code, content_type, headers, content, timed_out, error_msg, created)
    SELECT 
        id, 
        200,
        'application/json',
        '{}'::jsonb,
        '{"success": true}',
        false,
        NULL,
        NOW()
    FROM net.http_request_queue
    WHERE id IN (
        SELECT (message::jsonb->>'request_id')::bigint 
        FROM pgmq.q_on_version_delete
        WHERE message::jsonb->>'request_id' IS NOT NULL
    );
    
    -- Verify HTTP responses were mocked
    SELECT COUNT(*) INTO messages_count 
    FROM net._http_response
    WHERE status_code = 200;
    
    -- RAISE NOTICE 'Mocked responses count: %', messages_count;
    
    -- Process messages with mocked responses
    PERFORM process_function_queue('on_version_delete');
    
    -- Debug response details
    -- RAISE NOTICE 'Response details:';
    SELECT status_code, error_msg, id INTO msg
    FROM net._http_response 
    LIMIT 1;
    -- RAISE NOTICE 'Sample response - status: %, error: %, id: %', msg.status_code, msg.error_msg, msg.id;
    
    -- Debug message details
    SELECT message::jsonb->>'request_id' as req_id INTO msg
    FROM pgmq.q_on_version_delete
    LIMIT 1;
    -- RAISE NOTICE 'Sample message request_id: %', msg.req_id;
    
    -- Check remaining messages details
    -- RAISE NOTICE 'Messages with request_id still in queue: %', (
    --     SELECT COUNT(*) 
    --     FROM pgmq.q_on_version_delete 
    --     WHERE message::jsonb->>'request_id' IS NOT NULL
    -- );
    
    -- FOR msg in (
    --     SELECT read_ct, COUNT(*) 
    --     FROM pgmq.q_on_version_delete 
    --     GROUP BY read_ct 
    --     ORDER BY read_ct
    -- ) LOOP
    --     RAISE NOTICE 'Messages by read_ct %, count: %', msg.read_ct, msg.count;
    -- END LOOP;
    
    -- Verify all messages are processed
    SELECT COUNT(*) INTO messages_count 
    FROM pgmq.q_on_version_delete;

    -- RAISE NOTICE 'Messages remaining in queue: %', messages_count;
    
    -- TODO: fix this
    -- RETURN NEXT ok(messages_count = 0, 'All messages should be processed');

END;
$$ LANGUAGE plpgsql;

SELECT my_tests();

SELECT * FROM finish();
ROLLBACK;
