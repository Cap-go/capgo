-- read_version_usage

CREATE OR REPLACE FUNCTION read_version_usage(
  p_app_id VARCHAR(255),
  p_period_start TIMESTAMP,
  p_period_end TIMESTAMP
)
RETURNS TABLE (
  app_id VARCHAR(255),
  version_id BIGINT,
  date DATE,
  get BIGINT,
  fail BIGINT,
  install BIGINT,
  uninstall BIGINT
)
AS $$
BEGIN
  RETURN QUERY
  SELECT
    app_id,
    version as version_id,
    DATE_TRUNC('day', timestamp) AS date,
    SUM(CASE WHEN action = 'get' THEN 1 ELSE 0 END) AS get,
    SUM(CASE WHEN action = 'fail' THEN 1 ELSE 0 END) AS fail,
    SUM(CASE WHEN action = 'install' THEN 1 ELSE 0 END) AS install,
    SUM(CASE WHEN action = 'uninstall' THEN 1 ELSE 0 END) AS uninstall
  FROM version_usage
  WHERE
    app_id = p_app_id
    AND timestamp >= p_period_start
    AND timestamp < p_period_end
  GROUP BY date, app_id, version_id
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
