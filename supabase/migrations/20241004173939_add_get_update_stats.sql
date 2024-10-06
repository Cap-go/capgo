CREATE OR REPLACE FUNCTION public.get_update_stats()
RETURNS TABLE (
    failed bigint,
    install bigint,
    get bigint,
    success_rate numeric,
    healthy boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_events bigint;
    success_rate numeric;
BEGIN
    -- Get the counts for the last minute, 10 minutes ago
    SELECT
        COALESCE(SUM(CASE WHEN action = 'fail' THEN 1 ELSE 0 END), 0) AS failed,
        COALESCE(SUM(CASE WHEN action = 'install' THEN 1 ELSE 0 END), 0) AS install,
        COALESCE(SUM(CASE WHEN action = 'get' THEN 1 ELSE 0 END), 0) AS get
    INTO
        failed, install, get
    FROM
        version_usage
    WHERE
        timestamp >= (date_trunc('minute', now()) - INTERVAL '10 minutes')
        AND timestamp < (date_trunc('minute', now()) - INTERVAL '9 minutes');

    -- Calculate total events and success rate
    total_events := failed + install + get;
    IF total_events > 0 THEN
        success_rate := ((install + get)::numeric / total_events) * 100;
    ELSE
        success_rate := 100;
    END IF;

    -- Return the result
    RETURN QUERY SELECT
        failed,
        install,
        get,
        ROUND(success_rate, 2) AS success_rate,
        (success_rate >= 70) AS healthy;
END;
$$;

-- Grant necessary permissions
ALTER FUNCTION public.get_update_stats() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.get_update_stats() TO service_role;
