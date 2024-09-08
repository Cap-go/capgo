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
