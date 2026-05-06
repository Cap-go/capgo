ALTER TABLE public.device_usage
ADD COLUMN IF NOT EXISTS version_build character varying(70);

CREATE INDEX IF NOT EXISTS idx_device_usage_app_timestamp_version_build
ON public.device_usage USING btree (app_id, timestamp, version_build);

CREATE OR REPLACE FUNCTION public.read_native_version_usage(
    p_app_id character varying,
    p_period_start timestamp without time zone,
    p_period_end timestamp without time zone
)
RETURNS TABLE (
    date date,
    version_build character varying,
    devices bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    WITH daily_version_usage AS (
        SELECT
            date_trunc('day', du.timestamp)::date AS usage_date,
            COALESCE(
                NULLIF(du.version_build, ''),
                'unknown'
            )::character varying AS usage_version_build,
            du.device_id
        FROM public.device_usage AS du
        WHERE
            du.app_id = p_app_id
            AND du.timestamp >= p_period_start
            AND du.timestamp < p_period_end
    )
    SELECT
        usage_date AS date,
        usage_version_build AS version_build,
        COUNT(DISTINCT device_id)::bigint AS devices
    FROM daily_version_usage
    GROUP BY usage_date, usage_version_build
    ORDER BY usage_date;
END;
$$;

ALTER FUNCTION public.read_native_version_usage(
    character varying,
    timestamp without time zone,
    timestamp without time zone
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.read_native_version_usage(
    character varying,
    timestamp without time zone,
    timestamp without time zone
) FROM public;

REVOKE ALL ON FUNCTION public.read_native_version_usage(
    character varying,
    timestamp without time zone,
    timestamp without time zone
) FROM anon;

REVOKE ALL ON FUNCTION public.read_native_version_usage(
    character varying,
    timestamp without time zone,
    timestamp without time zone
) FROM authenticated;

GRANT ALL ON FUNCTION public.read_native_version_usage(
    character varying,
    timestamp without time zone,
    timestamp without time zone
) TO service_role;

COMMENT ON FUNCTION public.read_native_version_usage(
    character varying,
    timestamp without time zone,
    timestamp without time zone
) IS 'Service-role aggregate for native version usage.';
