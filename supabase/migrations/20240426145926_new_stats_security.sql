REVOKE EXECUTE ON FUNCTION public.process_requested_jobs() FROM public;
REVOKE EXECUTE ON FUNCTION public.process_requested_jobs()  FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_requested_jobs()  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_requested_jobs()  TO postgres;


REVOKE EXECUTE ON FUNCTION public.update_daily_storage() FROM public;
REVOKE EXECUTE ON FUNCTION public.update_daily_storage()  FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_daily_storage()  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_daily_storage()  TO postgres;

CREATE OR REPLACE FUNCTION read_storage_usage(
  p_app_id VARCHAR(255),
  p_period_start TIMESTAMP,
  p_period_end TIMESTAMP
)
RETURNS TABLE (
  date DATE,
  storage BIGINT
)
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE_TRUNC('day', timestamp) AS date,
    SUM(size) AS storage
  FROM version_meta
  WHERE
    timestamp >= p_period_start
    AND timestamp < p_period_end
    AND app_id = p_app_id
  GROUP BY date
  ORDER BY date;
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.read_storage_usage() FROM public;
REVOKE EXECUTE ON FUNCTION public.read_storage_usage()  FROM anon;
REVOKE EXECUTE ON FUNCTION public.read_storage_usage()  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.read_storage_usage()  TO postgres;

REVOKE EXECUTE ON FUNCTION public.read_device_usage() FROM public;
REVOKE EXECUTE ON FUNCTION public.read_device_usage()  FROM anon;
REVOKE EXECUTE ON FUNCTION public.read_device_usage()  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.read_device_usage()  TO postgres;

REVOKE EXECUTE ON FUNCTION public.read_bandwidth_usage() FROM public;
REVOKE EXECUTE ON FUNCTION public.read_bandwidth_usage()  FROM anon;
REVOKE EXECUTE ON FUNCTION public.read_bandwidth_usage()  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.read_bandwidth_usage()  TO postgres;

SELECT cron.unschedule('Update Daily Storage' );
DROP FUNCTION update_daily_storage();

