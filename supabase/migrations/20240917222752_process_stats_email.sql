CREATE OR REPLACE FUNCTION "public"."process_stats_email"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  app_record RECORD;
BEGIN
  FOR app_record IN (
    SELECT a.app_id, o.management_email
    FROM apps a
    JOIN orgs o ON a.owner_org = o.id
  )
  LOOP
    INSERT INTO job_queue (job_type, payload, function_type, function_name)
    VALUES (
      'TRIGGER',
      json_build_object('email', app_record.management_email, 'appId', app_record.app_id)::text,
      'cloudflare',
      'cron_email'
    );
  END LOOP;
END;
$$;

select
    cron.schedule('Send stats email every week', '0 12 * * 6', $$SELECT process_stats_email();$$);

ALTER FUNCTION "public"."process_stats_email"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."process_stats_email"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_stats_email"() TO "service_role";

ALTER TABLE app_versions 
DROP COLUMN signature;
