CREATE OR REPLACE FUNCTION get_process_cron_stats_job_info()
RETURNS TABLE (last_run timestamp with time zone, next_run timestamp with time zone) SECURITY DEFINER
AS $$
DECLARE
    v_schedule text;
    v_current_time timestamp with time zone := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
BEGIN
    -- Get the schedule
    SELECT schedule INTO v_schedule
    FROM cron.job
    WHERE jobname = 'process_cron_stats_jobs';

    IF v_schedule IS NULL THEN
        RAISE EXCEPTION 'Job "process_cron_stats_jobs" not found';
    END IF;

    RETURN QUERY
    SELECT
        -- Calculate last run time (most recent past 2 AM UTC)
        CASE
            WHEN v_current_time::time >= TIME '02:00:00' THEN
                v_current_time::date + TIME '02:00:00' AT TIME ZONE 'UTC'
            ELSE
                (v_current_time - INTERVAL '1 day')::date + TIME '02:00:00' AT TIME ZONE 'UTC'
        END AS last_run,
        -- Calculate next run time (next 2 AM UTC)
        CASE
            WHEN v_current_time::time < TIME '02:00:00' THEN
                v_current_time::date + TIME '02:00:00' AT TIME ZONE 'UTC'
            ELSE
                (v_current_time + INTERVAL '1 day')::date + TIME '02:00:00' AT TIME ZONE 'UTC'
        END AS next_run;
END;
$$ LANGUAGE plpgsql;
