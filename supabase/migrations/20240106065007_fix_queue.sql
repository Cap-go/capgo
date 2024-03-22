CREATE TYPE "public"."queue_job_status" AS ENUM (
    'inserted',
    'requested',
    'failed'
);

ALTER TABLE job_queue add "status" "public"."queue_job_status" DEFAULT 'inserted'::"public"."queue_job_status" NOT NULL;
ALTER TABLE job_queue add "request_id" bigint;
ALTER TABLE job_queue add "extra_info" jsonb DEFAULT '{}'::jsonb NOT NULL;


-- PERFORM -> SELECT in "SELECT process_current_jobs_if_unlocked"
SET statement_timeout TO 0;
CREATE OR REPLACE FUNCTION schedule_jobs()
RETURNS VOID
AS $body$
BEGIN
    -- Schedule first job
    PERFORM process_current_jobs_if_unlocked();
    
    -- Run the second job with a 20-second delay
    PERFORM pg_sleep(20);
    PERFORM process_current_jobs_if_unlocked();

    -- Run the third job with another 20-second delay
    PERFORM pg_sleep(20);
    PERFORM process_current_jobs_if_unlocked();
END;
$body$ LANGUAGE plpgsql;

SET statement_timeout TO 0;
CREATE OR REPLACE FUNCTION process_current_jobs_if_unlocked()
RETURNS setof BIGINT AS $$
<<declared>>
DECLARE
    worker RECORD;
    current_job RECORD;
    request_id bigint;
BEGIN
    -- Find an unlocked worker
    SELECT * INTO worker FROM workers FOR UPDATE SKIP LOCKED LIMIT 1;
    IF worker IS NOT NULL THEN
        RAISE NOTICE 'Using worker_id: %', worker.id;
        -- Lock the worker (this is already done by the SELECT ... FOR UPDATE)

        -- Here let's do the logic ;-)
        -- Limit of 100 rows, idk why but it sound good
        FOR current_job IN SELECT * FROM job_queue 
        WHERE job_queue.status = 'inserted'::"public"."queue_job_status"
        limit 100
        FOR UPDATE SKIP LOCKED
        LOOP
            RAISE NOTICE 'Processing job_id: %, payload: %', current_job.job_id, current_job.payload;

            IF (current_job.job_type = 'TRIGGER' AND current_job.function_name IS NOT NULL) THEN
                SELECT http_post_helper(current_job.function_name, current_job.function_type, current_job.payload::jsonb) INTO request_id;
                return next request_id;
            END IF;

            -- Note: In 20231020160052_queue_system.sql there is a section for APP_DELETE etc.
            -- Here I deleted it, it's not needed when clickhouse is enabled
            -- When selfhosting capgo concider readding that section here ;-)

            -- Delete the job from the queue
            RAISE NOTICE 'Delete job_id: %, payload: %', current_job.job_id, current_job.payload;
            UPDATE job_queue SET status='requested'::"public"."queue_job_status", request_id=declared.request_id WHERE job_id = current_job.job_id;
        END LOOP;

        -- Unlock the worker
        UPDATE workers SET locked = FALSE WHERE id = worker.id;
    ELSE
        RAISE NOTICE 'No unlocked workers available';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION process_requested_jobs()
RETURNS VOID AS $$
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
            UPDATE job_queue set status='failed'::"public"."queue_job_status", extra_info=jsonb_build_object('status_code', requested_job.status_code, 'content', requested_job.content, 'error_msg', requested_job.error_msg) where request_id=requested_job.id;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION retry_failed_jobs()
RETURNS VOID AS $$
BEGIN
    update job_queue set status = 'inserted'::"public"."queue_job_status" where status = 'failed'::"public"."queue_job_status";
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule(
    'process_requests_from_queue',
    '* * * * *',
    $$SELECT process_requested_jobs();$$
);

REVOKE ALL PRIVILEGES ON FUNCTION process_requested_jobs
  FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION retry_failed_jobs
  FROM anon, authenticated;
