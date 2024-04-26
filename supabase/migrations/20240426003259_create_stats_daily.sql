CREATE OR REPLACE FUNCTION process_requested_jobs()
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
    'process_requested_jobs',
    '0 2 * * *',
    $$SELECT process_requested_jobs();$$
);
