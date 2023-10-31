CREATE TABLE job_queue (
    job_id serial PRIMARY KEY,
    job_type TEXT NOT NULL CHECK (job_type IN ('TRIGGER', 'APP_DELETE', 'APP_VERSION_DELETE', 'DEVICE_DELETE')),
    payload TEXT NOT NULL,
    -- Both external and function_name are required for TRIGGER jobs
    function_type TEXT,
    function_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE workers (
    id SERIAL PRIMARY KEY,
    locked BOOLEAN NOT NULL DEFAULT FALSE
);

do $$
begin
execute (
    select string_agg('INSERT INTO workers DEFAULT VALUES',';')
    from generate_series(1,10)
);
end; 
$$;


SET statement_timeout TO 0;
CREATE OR REPLACE FUNCTION process_current_jobs_if_unlocked()
RETURNS VOID AS $$
DECLARE
    worker RECORD;
    current_job RECORD;
BEGIN
    -- Find an unlocked worker
    SELECT * INTO worker FROM workers FOR UPDATE SKIP LOCKED LIMIT 1;
    IF worker IS NOT NULL THEN
        RAISE NOTICE 'Using worker_id: %', worker.id;
        -- Lock the worker (this is already done by the SELECT ... FOR UPDATE)

        -- Here let's do the logic ;-)
        FOR current_job IN SELECT * FROM job_queue 
        FOR UPDATE SKIP LOCKED
        LOOP
            RAISE NOTICE 'Processing job_id: %, payload: %', current_job.job_id, current_job.payload;

            IF (current_job.job_type = 'TRIGGER' AND current_job.function_name IS NOT NULL) THEN
                PERFORM http_post_helper(current_job.function_name, current_job.function_type, current_job.payload::jsonb);
            END IF;

            IF (current_job.job_type = 'APP_DELETE') THEN
              --DELETE FROM "devices" where app_id=current_job.payload;
              --DELETE FROM "stats" where app_id=current_job.payload;
            END IF;

            -- Delete the job from the queue
            RAISE NOTICE 'Delete job_id: %, payload: %', current_job.job_id, current_job.payload;
            DELETE FROM job_queue WHERE job_id = current_job.job_id;
        END LOOP;

        -- Unlock the worker
        UPDATE workers SET locked = FALSE WHERE id = worker.id;
    ELSE
        RAISE NOTICE 'No unlocked workers available';
    END IF;
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule(
    'process_current_jobs_if_unlocked_',
    '* * * * *',
    $$ SELECT process_current_jobs_if_unlocked(); $$
);

CREATE OR REPLACE FUNCTION public.trigger_http_queue_post_to_function() 
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $BODY$
DECLARE 
  payload jsonb;
BEGIN 
  -- Build the payload
  payload := jsonb_build_object(
    'old_record', OLD, 
    'record', NEW, 
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA
  );

  -- Insert into job_queue
  INSERT INTO job_queue (job_type, payload, function_name, function_type) VALUES ('TRIGGER', payload::text, TG_ARGV[0], TG_ARGV[1]);

  RETURN NEW;
END;
$BODY$;

CREATE TRIGGER on_user_update_queue
AFTER UPDATE ON public.users 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('demo');