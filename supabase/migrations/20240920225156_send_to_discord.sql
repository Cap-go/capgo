-- Create retry_failed_jobs function
CREATE OR REPLACE FUNCTION "public"."retry_failed_jobs"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    discord_webhook_url TEXT;
    failed_job RECORD;
BEGIN
    SELECT decrypted_secret INTO discord_webhook_url
    FROM vault.decrypted_secrets
    WHERE name = 'DISCORD_WEBHOOK_URL';

    FOR failed_job IN 
        SELECT * FROM job_queue
        WHERE status = 'failed'::"public"."queue_job_status" AND retry_count <= retry_limit
        FOR UPDATE
    LOOP
        IF failed_job.retry_count = failed_job.retry_limit THEN
            -- Send Discord notification
            IF discord_webhook_url IS NOT NULL THEN
                PERFORM net.http_post(
                    url := discord_webhook_url,
                    headers := '{"Content-Type": "application/json"}'::jsonb,
                    body := format('{"content": "Job for org %s has failed %s times and reached the retry limit. Details: %s"}', 
                                   failed_job.org_id, failed_job.retry_count, 
                                   failed_job.extra_info)::jsonb
                );
            END IF;
            
            -- Mark as exceeding retry limit
            UPDATE job_queue
            SET retry_count = retry_limit + 1
            WHERE CURRENT OF failed_job;
        ELSE
            -- Retry the job
            UPDATE job_queue
            SET status = 'inserted'::"public"."queue_job_status"
            WHERE CURRENT OF failed_job;
        END IF;
    END LOOP;
END;
$$;

SELECT cron.schedule(
    'retry_failed_jobs',
    '*/2 * * * *',
    $$SELECT retry_failed_jobs()$$
);
