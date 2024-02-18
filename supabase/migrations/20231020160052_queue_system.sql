CREATE TABLE job_queue (
    job_id serial PRIMARY KEY,
    job_type TEXT NOT NULL CHECK (job_type IN ('TRIGGER', 'APP_DELETE', 'APP_VERSION_DELETE', 'DEVICE_DELETE')),
    payload TEXT NOT NULL,
    -- Both external and function_name are required for TRIGGER jobs
    function_type TEXT,
    function_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;

CREATE TABLE workers (
    id SERIAL PRIMARY KEY,
    locked BOOLEAN NOT NULL DEFAULT FALSE
);


ALTER TABLE workers ENABLE ROW LEVEL SECURITY;

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
RETURNS setof BIGINT AS $$
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
        FOR current_job IN SELECT * FROM job_queue 
        FOR UPDATE SKIP LOCKED
        LOOP
            RAISE NOTICE 'Processing job_id: %, payload: %', current_job.job_id, current_job.payload;

            IF (current_job.job_type = 'TRIGGER' AND current_job.function_name IS NOT NULL) THEN
                SELECT http_post_helper(current_job.function_name, current_job.function_type, current_job.payload::jsonb) INTO request_id;
                return next request_id;
            END IF;

            -- Please tell me if this APP_DELETE, DEVICE_DELETE, APP_VERSION_DELETE is even required with clickhouse @riderx
            -- Also the removal of an app is very expensive. Deleting an app could create a lot of tasks
            -- First a removal of an app creates an `APP_DELETE` and `APP_VERSION_DELETE` task for every app . `APP_VERSION_DELETE` deletes devices that have that specific `app_id` and that specific `version` as well as stats for that specific version.
            -- Second the `APP_DELETE` deletes all devices with that `app_id` and all stats with that `app_id`
            --Third removing a device causes a `DEVICE_DELETE` and that again removes from `stats` for that specific device.

            IF (current_job.job_type = 'APP_DELETE') THEN
                DELETE FROM "devices" where app_id=current_job.payload::jsonb->>'app_id';
                DELETE FROM "stats" where app_id=current_job.payload::jsonb->>'app_id';
            END IF;

            IF (current_job.job_type = 'DEVICE_DELETE') THEN
                DELETE FROM "stats" where app_id=current_job.payload::jsonb->>'app_id' and device_id=current_job.payload::jsonb->>'device_id';
            END IF;

            IF (current_job.job_type = 'APP_VERSION_DELETE') THEN
                DELETE FROM "devices" where app_id=current_job.payload::jsonb->>'app_id' and "version"=(current_job.payload::jsonb->>'id')::bigint;
                DELETE FROM "stats" where app_id=current_job.payload::jsonb->>'app_id' and "version"=(current_job.payload::jsonb->>'id')::bigint;
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

REVOKE ALL PRIVILEGES ON FUNCTION process_current_jobs_if_unlocked
  FROM anon, authenticated;

SET statement_timeout TO 0;
CREATE OR REPLACE FUNCTION schedule_jobs()
RETURNS VOID
AS $body$
BEGIN
    -- Schedule first job
    PERFORM cron.schedule(
        'process_current_jobs_if_unlocked_job_1',
        '* * * * *',
        $$SELECT process_current_jobs_if_unlocked(); $$
    );
    -- Schedule second job with a 20-second delay
    PERFORM pg_sleep(20);
    PERFORM cron.schedule(
        'process_current_jobs_if_unlocked_job_2',
        '* * * * *',
        $$SELECT process_current_jobs_if_unlocked(); $$
    );
    -- Schedule third job with another 20-second delay
    PERFORM pg_sleep(20);
    PERFORM cron.schedule(
        'process_current_jobs_if_unlocked_job_3',
        '* * * * *',
        $$SELECT process_current_jobs_if_unlocked(); $$
    );
END;
$body$ LANGUAGE plpgsql;

REVOKE ALL PRIVILEGES ON FUNCTION schedule_jobs
  FROM anon, authenticated;

SELECT cron.schedule(
    'process_tasks_subminute',
    '* * * * *',
    $$ SELECT schedule_jobs(); $$
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

REVOKE ALL PRIVILEGES ON FUNCTION trigger_http_queue_post_to_function
  FROM anon, authenticated;

-- Old triggers drop
drop trigger on_app_delete_sql on apps;
drop trigger on_app_versions_delete_sql on app_versions;
drop trigger on_device_delete_sql on devices;

-- Recreate triggers
CREATE OR REPLACE FUNCTION on_app_delete_sql() RETURNS TRIGGER AS $_$
BEGIN
    INSERT INTO job_queue (job_type, payload) VALUES ('APP_DELETE', row_to_json(OLD)::text);
    RETURN OLD;
END $_$ LANGUAGE 'plpgsql';

CREATE OR REPLACE FUNCTION on_app_version_delete_sql() RETURNS TRIGGER AS $_$
BEGIN
    INSERT INTO job_queue (job_type, payload) VALUES ('APP_VERSION_DELETE', row_to_json(OLD)::text);
    RETURN OLD;
END $_$ LANGUAGE 'plpgsql';

CREATE OR REPLACE FUNCTION on_device_delete_sql() RETURNS TRIGGER AS $_$
BEGIN
    INSERT INTO job_queue (job_type, payload) VALUES ('DEVICE_DELETE', row_to_json(OLD)::text);
    RETURN OLD;
END $_$ LANGUAGE 'plpgsql';

-- Readd the triggers
CREATE TRIGGER on_app_delete_sql 
BEFORE DELETE ON apps 
FOR EACH ROW 
EXECUTE PROCEDURE on_app_delete_sql();

CREATE TRIGGER on_app_versions_delete_sql 
BEFORE DELETE ON app_versions 
FOR EACH ROW 
EXECUTE PROCEDURE on_app_version_delete_sql();

CREATE TRIGGER on_device_delete_sql 
BEFORE DELETE ON devices 
FOR EACH ROW 
EXECUTE PROCEDURE on_device_delete_sql();

-- @Martin you can use this for the migration. I had to change seed.sql due to seed.sql being applied after this migration
-- Drop triggers for trigger_http_post_to_function

-- drop trigger on_channel_create on channels;
-- drop trigger on_channel_update on channels;
-- drop trigger on_shared_create on channel_users;
-- drop trigger on_user_create on users;
-- drop trigger on_user_update on users;
-- drop trigger on_version_create on app_versions;
-- drop trigger on_version_update on app_versions;
-- drop trigger on_devices_override_update on devices_override;
-- drop trigger on_channel_devices_update on channel_devices;

-- Create triggers with the new and shiny queue system

-- CREATE TRIGGER on_channel_create 
-- AFTER INSERT ON public.channels 
-- FOR EACH ROW 
-- EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_channel_create');

-- CREATE TRIGGER on_channel_update 
-- AFTER UPDATE ON public.channels 
-- FOR EACH ROW 
-- EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_channel_update');

-- CREATE TRIGGER on_shared_create 
-- AFTER INSERT ON public.channel_users 
-- FOR EACH ROW 
-- EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_shared_create');

-- CREATE TRIGGER on_user_create 
-- AFTER INSERT ON public.users 
-- FOR EACH ROW 
-- EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_user_create');

-- CREATE TRIGGER on_user_update 
-- AFTER UPDATE ON public.users 
-- FOR EACH ROW 
-- EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_user_update');

-- CREATE TRIGGER on_version_create 
-- AFTER INSERT ON public.app_versions 
-- FOR EACH ROW 
-- EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_version_create');

-- CREATE TRIGGER on_version_update 
-- AFTER UPDATE ON public.app_versions 
-- FOR EACH ROW 
-- EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_version_update');

-- CREATE TRIGGER on_devices_override_update 
-- AFTER INSERT or UPDATE or DELETE ON public.devices_override 
-- FOR EACH ROW 
-- EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_device_update');

-- CREATE TRIGGER on_channel_devices_update 
-- AFTER INSERT or UPDATE or DELETE ON public.channel_devices 
-- FOR EACH ROW 
-- EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_device_update');
