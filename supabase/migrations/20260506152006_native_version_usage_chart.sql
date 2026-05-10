ALTER TABLE public.device_usage
ADD COLUMN IF NOT EXISTS version_build character varying(70),
ADD COLUMN IF NOT EXISTS platform character varying(32);

CREATE INDEX IF NOT EXISTS idx_device_usage_app_timestamp_version_build
ON public.device_usage USING btree (app_id, timestamp, version_build);

CREATE INDEX IF NOT EXISTS idx_device_usage_app_timestamp_platform_version_build
ON public.device_usage USING btree (app_id, timestamp, platform, version_build);

DROP POLICY IF EXISTS "Disable for all" ON public.device_usage;
DROP POLICY IF EXISTS "Allow org members to select device_usage" ON public.device_usage;
DROP POLICY IF EXISTS "Deny insert on device_usage" ON public.device_usage;
DROP POLICY IF EXISTS "Deny update on device_usage" ON public.device_usage;
DROP POLICY IF EXISTS "Deny delete on device_usage" ON public.device_usage;

CREATE POLICY "Disable for all"
ON public.device_usage
USING (false)
WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.read_native_version_usage(
    p_app_id character varying,
    p_period_start timestamp without time zone,
    p_period_end timestamp without time zone
)
RETURNS TABLE (
    date date,
    platform character varying,
    version_build character varying,
    devices bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    WITH authorized_app AS (
        SELECT apps.app_id
        FROM public.apps
        WHERE
            apps.app_id = p_app_id
            AND public.check_min_rights(
                'read'::public.user_min_right,
                public.get_identity_org_appid(
                    '{read,upload,write,all}'::public.key_mode[],
                    apps.owner_org,
                    apps.app_id
                ),
                apps.owner_org,
                apps.app_id,
                NULL::bigint
            )
    ),
    daily_version_usage AS (
        SELECT
            date_trunc('day', du.timestamp)::date AS usage_date,
            COALESCE(
                NULLIF(du.platform, ''),
                NULLIF(d.platform::text, ''),
                'unknown'
            )::character varying AS usage_platform,
            COALESCE(
                NULLIF(du.version_build, ''),
                'unknown'
            )::character varying AS usage_version_build,
            du.device_id
        FROM public.device_usage AS du
        INNER JOIN authorized_app AS aa
            ON aa.app_id = du.app_id
        LEFT JOIN public.devices AS d
            ON d.app_id = du.app_id
            AND d.device_id = du.device_id
        WHERE
            du.timestamp >= p_period_start
            AND du.timestamp < p_period_end
    )
    SELECT
        usage_date AS date,
        usage_platform AS platform,
        usage_version_build AS version_build,
        COUNT(DISTINCT device_id)::bigint AS devices
    FROM daily_version_usage
    GROUP BY usage_date, usage_platform, usage_version_build
    ORDER BY usage_date, usage_platform, usage_version_build;
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

GRANT ALL ON FUNCTION public.read_native_version_usage(
    character varying,
    timestamp without time zone,
    timestamp without time zone
) TO authenticated;

GRANT ALL ON FUNCTION public.read_native_version_usage(
    character varying,
    timestamp without time zone,
    timestamp without time zone
) TO anon;

COMMENT ON FUNCTION public.read_native_version_usage(
    character varying,
    timestamp without time zone,
    timestamp without time zone
) IS 'Authorized aggregate for native version usage by platform. Raw device_usage rows remain denied by RLS.';
