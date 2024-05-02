CREATE OR REPLACE FUNCTION read_device_usage(
  p_app_id VARCHAR(255),
  p_period_start TIMESTAMP,
  p_period_end TIMESTAMP
)
RETURNS TABLE (
  date DATE,
  mau BIGINT,
  app_id VARCHAR(255)
)
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE_TRUNC('day', timestamp) AS date,
    COUNT(DISTINCT device_id) AS mau,
    app_id
  FROM device_usage
  WHERE
    app_id = p_app_id
    AND timestamp >= p_period_start
    AND timestamp < p_period_end
  GROUP BY app_id, date
  ORDER BY date;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION read_bandwidth_usage(
  p_app_id VARCHAR(255),
  p_period_start TIMESTAMP,
  p_period_end TIMESTAMP
)
RETURNS TABLE (
  date DATE,
  bandwidth BIGINT,
  app_id VARCHAR(255)
)
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE_TRUNC('day', timestamp) AS date,
    SUM(file_size) AS bandwidth,
    app_id
  FROM bandwidth_usage
  WHERE
    timestamp >= p_period_start
    AND timestamp < p_period_end
    AND app_id = p_app_id
  GROUP BY date
  ORDER BY date;
END;
$$ LANGUAGE plpgsql;
