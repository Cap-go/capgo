CREATE OR REPLACE FUNCTION process_cron_stats_jobs()
RETURNS VOID AS $$
DECLARE
  app_record RECORD;
BEGIN
  FOR app_record IN (
    SELECT DISTINCT av.app_id, av.owner_org
    FROM app_versions av
    WHERE av.created_at >= NOW() - INTERVAL '30 days'
    
    UNION
    
    SELECT DISTINCT dm.app_id, av.owner_org
    FROM daily_mau dm
    JOIN app_versions av ON dm.app_id = av.app_id
    WHERE dm.date >= NOW() - INTERVAL '30 days' AND dm.mau > 0
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
