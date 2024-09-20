-- Add columns to job_queue
ALTER TABLE job_queue
ADD COLUMN retry_count INT DEFAULT 0,
ADD COLUMN retry_limit INT DEFAULT 10;

CREATE OR REPLACE FUNCTION "public"."process_requested_jobs"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    requested_job RECORD;
BEGIN
    FOR requested_job IN SELECT net._http_response.id, net._http_response.status_code, net._http_response.content, net._http_response.error_msg from job_queue  
    left join net._http_response on net._http_response.id=job_queue.request_id 
    where status='requested'::"public"."queue_job_status" AND request_id is distinct from NULL
    limit 500
    FOR UPDATE OF "job_queue" SKIP LOCKED
    LOOP
        -- RAISE NOTICE 'Checking request: %', requested_job.id;

        IF (requested_job.error_msg is not distinct from NULL AND requested_job.status_code BETWEEN 199 AND 299) THEN
            -- RAISE NOTICE 'Delete request: %', requested_job.id;
            DELETE FROM net._http_response WHERE id=requested_job.id;
            DELETE FROM job_queue WHERE job_queue.request_id=requested_job.id;
        ELSE
            -- RAISE NOTICE 'Job failed: %', requested_job.id;
            UPDATE job_queue 
            SET status='failed'::"public"."queue_job_status", 
                extra_info=jsonb_build_object('status_code', requested_job.status_code, 'content', requested_job.content, 'error_msg', requested_job.error_msg),
                retry_count = retry_count + 1
            WHERE request_id=requested_job.id;
        END IF;
    END LOOP;
END;
$$;

-- Create retry_failed_jobs function
CREATE OR REPLACE FUNCTION "public"."retry_failed_jobs"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE job_queue
    SET status='inserted'::"public"."queue_job_status"
    WHERE status='failed'::"public"."queue_job_status" AND retry_count < retry_limit;
END;
$$;
