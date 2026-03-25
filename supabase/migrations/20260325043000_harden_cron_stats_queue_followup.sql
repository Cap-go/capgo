-- Follow up the initial cron stats activity fix without rewriting the
-- already-pushed migration on main.
--
-- This keeps live dashboard refresh scheduling off the request path while
-- tightening queue dedupe/locking behavior in SQL.

CREATE OR REPLACE FUNCTION public.queue_cron_stat_app_for_app(
  p_app_id character varying,
  p_org_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_org_id uuid;
  v_lock_key integer;
  v_lock_acquired boolean := false;
BEGIN
  IF p_app_id IS NULL OR p_app_id = '' THEN
    RETURN;
  END IF;

  v_org_id := p_org_id;

  IF v_org_id IS NULL THEN
    SELECT CASE
      WHEN a.owner_org IS NOT NULL THEN a.owner_org
      ELSE da.owner_org
    END
    INTO v_org_id
    FROM (
      SELECT p_app_id AS app_id
    ) AS requested_app
    LEFT JOIN public.apps a ON a.app_id = requested_app.app_id
    LEFT JOIN public.deleted_apps da ON da.app_id = requested_app.app_id
    LIMIT 1;
  END IF;

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  -- Use a session lock so dedupe stays atomic without accumulating xact locks
  -- across the whole cron sweep.
  v_lock_key := pg_catalog.hashtext(p_app_id);
  BEGIN
    PERFORM pg_catalog.pg_advisory_lock(v_lock_key);
    v_lock_acquired := true;

    IF NOT EXISTS (
      SELECT 1
      FROM pgmq.q_cron_stat_app AS queued_job
      WHERE queued_job.message->'payload'->>'appId' = p_app_id
    ) THEN
      PERFORM pgmq.send('cron_stat_app',
        pg_catalog.jsonb_build_object(
          'function_name', 'cron_stat_app',
          'function_type', 'cloudflare',
          'payload', pg_catalog.jsonb_build_object(
            'appId', p_app_id,
            'orgId', v_org_id,
            'todayOnly', false
          )
        )
      );
    END IF;

    PERFORM pg_catalog.pg_advisory_unlock(v_lock_key);
    v_lock_acquired := false;
  EXCEPTION
    WHEN query_canceled THEN
      IF v_lock_acquired THEN
        PERFORM pg_catalog.pg_advisory_unlock(v_lock_key);
      END IF;
      RAISE;
    WHEN OTHERS THEN
      IF v_lock_acquired THEN
        PERFORM pg_catalog.pg_advisory_unlock(v_lock_key);
      END IF;
      RAISE;
  END;
END;
$function$;

ALTER FUNCTION public.queue_cron_stat_app_for_app(character varying, uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.queue_cron_stat_app_for_app(character varying, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.queue_cron_stat_app_for_app(character varying, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.queue_cron_stat_app_for_app(character varying, uuid) FROM authenticated;
GRANT ALL ON FUNCTION public.queue_cron_stat_app_for_app(character varying, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.process_cron_stats_jobs() RETURNS void
LANGUAGE plpgsql
SET search_path = '' AS $function$
DECLARE
  app_record RECORD;
BEGIN
  FOR app_record IN (
    WITH active_apps AS (
      SELECT DISTINCT av.app_id
      FROM public.app_versions av
      WHERE av.created_at >= NOW() - INTERVAL '30 days'

      UNION

      SELECT DISTINCT dm.app_id
      FROM public.daily_mau dm
      WHERE dm.date >= NOW() - INTERVAL '30 days' AND dm.mau > 0

      UNION

      SELECT DISTINCT du.app_id
      FROM public.device_usage du
      WHERE du.timestamp >= NOW() - INTERVAL '30 days'

      UNION

      SELECT DISTINCT bu.app_id
      FROM public.bandwidth_usage bu
      WHERE bu.timestamp >= NOW() - INTERVAL '30 days'
    )
    SELECT DISTINCT
      active_apps.app_id,
      a.owner_org
    FROM active_apps
    INNER JOIN public.apps a ON a.app_id = active_apps.app_id
  )
  LOOP
    PERFORM public.queue_cron_stat_app_for_app(app_record.app_id, app_record.owner_org);
  END LOOP;
END;
$function$;

ALTER FUNCTION public.process_cron_stats_jobs() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.process_cron_stats_jobs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_cron_stats_jobs() FROM anon;
REVOKE ALL ON FUNCTION public.process_cron_stats_jobs() FROM authenticated;
GRANT ALL ON FUNCTION public.process_cron_stats_jobs() TO service_role;
