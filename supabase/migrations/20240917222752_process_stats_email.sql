CREATE OR REPLACE FUNCTION "public"."process_stats_email"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  app_record RECORD;
BEGIN
  FOR app_record IN (
    SELECT a.id, o.management_email
    FROM apps a
    JOIN orgs o ON a.org_id = o.id
  )
  LOOP
    INSERT INTO job_queue (job_type, payload, function_type, function_name)
    VALUES (
      'TRIGGER',
      json_build_object('email', app_record.management_email, 'appId', app_record.id)::text,
      'cloudflare',
      'cron_plan'
    );
  END LOOP;
END;
$$;

ALTER FUNCTION "public"."process_stats_email"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."process_stats_email"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_stats_email"() TO "service_role";

-- delete old 'Send stats email every week'

SELECT cron.unschedule('Send stats email every week');

-- create new 'Send stats email every week' with new function
SELECT cron.schedule(
    'Send stats email every week',
    '0 12 * * 6',
    $$SELECT process_stats_email();$$
);
