-- Console query performance.
--
-- 1. The restrictive "Prevent non 2FA access" policies called verify_mfa() bare,
--    so Postgres evaluated it once per candidate row. Wrapping the call in a
--    scalar subquery makes it an InitPlan evaluated once per statement, with the
--    same result. Measured on 27k bundles: count 140 ms -> 7 ms.
ALTER POLICY "Prevent non 2FA access" ON public.apikeys USING ((SELECT public.verify_mfa()));
ALTER POLICY "Prevent non 2FA access" ON public.app_versions USING ((SELECT public.verify_mfa()));
ALTER POLICY "Prevent non 2FA access" ON public.apps USING ((SELECT public.verify_mfa()));
ALTER POLICY "Prevent non 2FA access" ON public.channel_devices USING ((SELECT public.verify_mfa()));
ALTER POLICY "Prevent non 2FA access" ON public.channels USING ((SELECT public.verify_mfa()));
ALTER POLICY "Prevent non 2FA access" ON public.org_users USING ((SELECT public.verify_mfa()));
ALTER POLICY "Prevent non 2FA access" ON public.orgs USING ((SELECT public.verify_mfa()));

-- 2. Daily counts for the dashboard upload and deployment charts. The console
--    used to download every bundle or deploy of the window (tens of thousands
--    of rows for CI-heavy organizations) only to bucket them by day. Security
--    invoker: the caller's RLS still decides which rows count. day_index is the
--    whole number of days since p_start, the bucket the charts use.
CREATE OR REPLACE FUNCTION public.get_bundle_upload_daily_counts(
  p_app_ids character varying[],
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE (app_id character varying, day_index integer, uploads bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    v.app_id,
    floor(extract(epoch FROM (v.created_at - p_start)) / 86400)::integer AS day_index,
    count(*) AS uploads
  FROM public.app_versions v
  WHERE v.app_id = ANY (p_app_ids)
    AND v.created_at >= p_start
    AND v.created_at < p_end
    -- builtin/unknown placeholders are created by the system, not uploaded.
    AND NOT (
      v.deleted
      AND coalesce(v.r2_path, '') = ''
      AND coalesce(v.external_url, '') = ''
      AND v.user_id IS NULL
    )
  GROUP BY 1, 2
$$;

REVOKE ALL ON FUNCTION public.get_bundle_upload_daily_counts(character varying[], timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bundle_upload_daily_counts(character varying[], timestamptz, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_deploy_daily_counts(
  p_app_ids character varying[],
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE (app_id character varying, channel_id bigint, channel_name character varying, day_index integer, deploys bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    d.app_id,
    d.channel_id,
    c.name AS channel_name,
    floor(extract(epoch FROM (d.deployed_at - p_start)) / 86400)::integer AS day_index,
    count(*) AS deploys
  FROM public.deploy_history d
  LEFT JOIN public.channels c ON c.id = d.channel_id
  WHERE d.app_id = ANY (p_app_ids)
    AND d.deployed_at >= p_start
    AND d.deployed_at < p_end
  GROUP BY 1, 2, 3, 4
$$;

REVOKE ALL ON FUNCTION public.get_deploy_daily_counts(character varying[], timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_deploy_daily_counts(character varying[], timestamptz, timestamptz) TO authenticated, service_role;
