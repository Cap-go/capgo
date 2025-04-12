CREATE OR REPLACE FUNCTION "public"."process_stats_email_monthly"()
RETURNS "void"
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
    PERFORM pgmq.send('cron_email',
      jsonb_build_object(
        'function_name', 'cron_email',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object(
          'email', app_record.management_email,
          'appId', app_record.app_id,
          'type', 'monthly_create_stats'
        )
      )
    );
END;
$$;

SELECT cron.unschedule('Send stats email every week');
DROP FUNCTION "public"."process_stats_email"();

CREATE OR REPLACE FUNCTION "public"."process_stats_email_weekly"()
RETURNS "void"
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
    PERFORM pgmq.send('cron_email',
      jsonb_build_object(
        'function_name', 'cron_email',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object(
          'email', app_record.management_email,
          'appId', app_record.app_id,
          'type', 'weekly_install_stats'
        )
      )
    );
END;
$$;



select
    cron.schedule('Send stats email every month', '0 12 1 * *', $$SELECT process_stats_email_monthly();$$);

ALTER FUNCTION "public"."process_stats_email_monthly"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."process_stats_email_monthly"() FROM PUBLIC;

select
    cron.schedule('Send stats email every week', '0 12 * * 6', $$SELECT process_stats_email_weekly();$$);

ALTER FUNCTION "public"."process_stats_email_weekly"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."process_stats_email_weekly"() FROM PUBLIC;
