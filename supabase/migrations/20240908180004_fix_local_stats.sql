CREATE OR REPLACE FUNCTION "public"."read_device_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone)
RETURNS TABLE("date" date, "mau" bigint, "app_id" character varying)
LANGUAGE "plpgsql"
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE_TRUNC('day', device_usage.timestamp)::date AS date,
    COUNT(DISTINCT device_usage.device_id) AS mau,
    device_usage.app_id
  FROM device_usage
  WHERE
    device_usage.app_id = p_app_id
    AND device_usage.timestamp >= p_period_start
    AND device_usage.timestamp < p_period_end
  GROUP BY DATE_TRUNC('day', device_usage.timestamp)::date, device_usage.app_id
  ORDER BY date;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."process_cron_stats_jobs"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
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
      json_build_object('appId', app_record.app_id, 'orgId', app_record.owner_org, 'todayOnly', false)::text,
      'cloudflare',
      'cron_stats'
    );
  END LOOP;
END;
$$;
