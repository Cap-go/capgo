select
    cron.unschedule('Update channel for progressive deploy if too many fail');

DROP PROCEDURE IF EXISTS "public"."update_channels_progressive_deploy";

select
    cron.unschedule('cleanup-frequent-job-details');

CREATE OR REPLACE FUNCTION "public"."cleanup_frequent_job_details"() RETURNS void
LANGUAGE "plpgsql"
AS $$
BEGIN
    DELETE FROM cron.job_run_details 
    WHERE job_pid IN (
        SELECT jobid 
        FROM cron.job 
        WHERE schedule = '5 seconds' OR schedule = '1 seconds'
    ) 
    AND end_time < now() - interval '1 hour';
END;
$$;

SELECT cron.schedule('Cleanup frequent job details', '0 * * * *', $$CALL cleanup_frequent_job_details()$$);

DROP FUNCTION IF EXISTS "public"."cleanup_frequent_job_details";

CREATE OR REPLACE FUNCTION "public"."remove_old_jobs"() RETURNS void
LANGUAGE "plpgsql"
AS $$
BEGIN
    DELETE FROM cron.job_run_details 
    WHERE end_time < now() - interval '1 day';
END;
$$;

SELECT cron.schedule('Remove old jobs', '0 0 * * *', $$CALL remove_old_jobs()$$);
