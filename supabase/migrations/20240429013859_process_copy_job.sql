DROP FUNCTION IF EXISTS process_requested_jobs();

CREATE OR REPLACE FUNCTION process_cron_stats_jobs()
RETURNS VOID AS $$
DECLARE
  app_record RECORD;
BEGIN
  FOR app_record IN (
    SELECT DISTINCT app_id, owner_org
    FROM app_versions
    WHERE created_at >= NOW() - INTERVAL '30 days'
  )
  LOOP
    INSERT INTO job_queue (job_type, payload, function_type, function_name)
    VALUES (
      'TRIGGER',
      json_build_object('appId', app_record.app_id, 'orgId', app_record.owner_org)::text,
      'cloudflare',
      'cron_stats'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule(
    'process_cron_stats_jobs',
    '0 2 * * *',
    $$SELECT process_cron_stats_jobs();$$
);

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

REVOKE ALL PRIVILEGES ON FUNCTION process_requested_jobs
  FROM anon, authenticated;
