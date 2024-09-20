CREATE OR REPLACE FUNCTION "public"."process_requested_jobs"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    requested_job RECORD;
    discord_webhook_url TEXT;
BEGIN
    SELECT decrypted_secret INTO discord_webhook_url
    FROM vault.decrypted_secrets
    WHERE name = 'DISCORD_WEBHOOK_URL';

    FOR requested_job IN SELECT net._http_response.id, net._http_response.status_code, net._http_response.content, net._http_response.error_msg, job_queue.retry_count, job_queue.retry_limit, job_queue.org_id from job_queue  
    left join net._http_response on net._http_response.id=job_queue.request_id 
    where status='requested'::"public"."queue_job_status" AND request_id is distinct from NULL
    limit 500
    FOR UPDATE OF "job_queue" SKIP LOCKED
    LOOP
        IF (requested_job.error_msg is not distinct from NULL AND requested_job.status_code BETWEEN 199 AND 299) THEN
            DELETE FROM net._http_response WHERE id=requested_job.id;
            DELETE FROM job_queue WHERE job_queue.request_id=requested_job.id;
        ELSE
            UPDATE job_queue 
            SET status='failed'::"public"."queue_job_status", 
                extra_info=jsonb_build_object('status_code', requested_job.status_code, 'content', requested_job.content, 'error_msg', requested_job.error_msg),
                retry_count = retry_count + 1
            WHERE request_id=requested_job.id;

            IF requested_job.retry_count + 1 >= requested_job.retry_limit AND discord_webhook_url IS NOT NULL THEN
                PERFORM net.http_post(
                    url:=discord_webhook_url,
                    headers:='{"Content-Type": "application/json"}'::jsonb,
                    body:=format('{"content": "Job for org %s has failed %s times and reached the retry limit. Details: %s"}', 
                                 requested_job.org_id, requested_job.retry_count + 1, 
                                 jsonb_build_object('status_code', requested_job.status_code, 'content', requested_job.content, 'error_msg', requested_job.error_msg))::jsonb
                );
            END IF;
        END IF;
    END LOOP;
END;
$$;
