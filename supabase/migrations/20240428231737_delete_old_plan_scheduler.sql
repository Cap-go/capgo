SELECT cron.unschedule('Update plan');

drop function read_device_usage(p_app_id VARCHAR(255), p_period_start TIMESTAMP, p_period_end TIMESTAMP);
CREATE OR REPLACE FUNCTION read_storage_usage(
  p_app_id VARCHAR(255),
  p_period_start TIMESTAMP,
  p_period_end TIMESTAMP
)
RETURNS TABLE (
  app_id VARCHAR(255),
  date DATE,
  storage BIGINT
)
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p_app_id AS app_id,
    DATE_TRUNC('day', timestamp) AS date,
    SUM(size) AS storage
  FROM version_meta
  WHERE
    timestamp >= p_period_start
    AND timestamp < p_period_end
    AND app_id = p_app_id
  GROUP BY app_id, date
  ORDER BY date;
END;
$$ LANGUAGE plpgsql;
REVOKE EXECUTE ON FUNCTION public.read_device_usage(  p_app_id VARCHAR(255),
  p_period_start TIMESTAMP,
  p_period_end TIMESTAMP) FROM public;
REVOKE EXECUTE ON FUNCTION public.read_device_usage(  p_app_id VARCHAR(255),
  p_period_start TIMESTAMP,
  p_period_end TIMESTAMP)  FROM anon;
REVOKE EXECUTE ON FUNCTION public.read_device_usage(  p_app_id VARCHAR(255),
  p_period_start TIMESTAMP,
  p_period_end TIMESTAMP)  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.read_device_usage(  p_app_id VARCHAR(255),
  p_period_start TIMESTAMP,
  p_period_end TIMESTAMP)  TO postgres;

CREATE OR REPLACE FUNCTION process_subscribed_orgs()
RETURNS VOID AS $$
DECLARE
  org_record RECORD;
BEGIN
  FOR org_record IN (
    SELECT o.id, o.customer_id
    FROM orgs o
    JOIN stripe_info si ON o.customer_id = si.customer_id
    WHERE si.status = 'succeeded' AND si.product_id != 'free'
  )
  LOOP
    INSERT INTO job_queue (job_type, payload, function_type, function_name)
    VALUES (
      'TRIGGER',
      json_build_object('orgId', org_record.id, 'customerId', org_record.customer_id)::text,
      'http',
      'cron_check_plan'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule(
    'process_subscribed_orgs',
    '0 3 * * *',
    $$SELECT process_subscribed_orgs();$$
);

REVOKE EXECUTE ON FUNCTION public.process_subscribed_orgs() FROM public;
REVOKE EXECUTE ON FUNCTION public.process_subscribed_orgs()  FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_subscribed_orgs()  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_subscribed_orgs()  TO postgres;


CREATE OR REPLACE FUNCTION process_free_trial_expired()
RETURNS VOID AS $$
BEGIN
  UPDATE stripe_info
  SET is_good_plan = false
  WHERE product_id = 'free' AND trial_at < NOW();
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule(
    'process_free_trial_expired',
    '0 0 * * *',
    $$SELECT process_free_trial_expired();$$
);

REVOKE EXECUTE ON FUNCTION public.process_free_trial_expired() FROM public;
REVOKE EXECUTE ON FUNCTION public.process_free_trial_expired()  FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_free_trial_expired()  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_free_trial_expired()  TO postgres;

DROP FUNCTION "public"."is_free_usage"("userid" "uuid");
DROP FUNCTION public.is_free_usage();
