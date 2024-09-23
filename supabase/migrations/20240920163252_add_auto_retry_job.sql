
CREATE OR REPLACE FUNCTION "public"."process_current_jobs_if_unlocked"() RETURNS SETOF bigint
    LANGUAGE "plpgsql"
    AS $$
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
        -- Limit of 200 rows, since pg net batch by default is 200
        FOR current_job IN SELECT * FROM job_queue 
        WHERE job_queue.status = 'inserted'::"public"."queue_job_status"
        ORDER BY job_queue.created_at ASC
        limit 200
        FOR UPDATE SKIP LOCKED
        LOOP
            RAISE NOTICE 'Processing job_id: %, payload: %', current_job.job_id, current_job.payload;
            IF (current_job.job_type = 'TRIGGER' AND current_job.function_name IS NOT NULL) THEN
                SELECT http_post_helper(current_job.function_name, current_job.function_type, current_job.payload::jsonb) INTO request_id;
                return next request_id;
            END IF;
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
$$
