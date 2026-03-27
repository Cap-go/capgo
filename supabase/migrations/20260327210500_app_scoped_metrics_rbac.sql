-- Restore app-scoped chart access after org-scoped hardening on get_app_metrics.
-- The app statistics endpoint already enforces app.read, so it must not depend on
-- an org-only RPC that silently returns no rows for app-limited callers.

CREATE OR REPLACE FUNCTION public.get_app_metrics(
  "p_org_id" uuid,
  "p_app_id" character varying,
  "p_start_date" date,
  "p_end_date" date
)
RETURNS TABLE(
  app_id character varying,
  date date,
  mau bigint,
  storage bigint,
  bandwidth bigint,
  build_time_unit bigint,
  get bigint,
  fail bigint,
  install bigint,
  uninstall bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  cache_entry public.app_metrics_cache%ROWTYPE;
  caller_role text;
  caller_id uuid;
  app_exists boolean;
BEGIN
  SELECT COALESCE(current_setting('role', true), '') INTO caller_role;

  IF NOT (
    caller_role IN ('service_role', 'postgres', 'supabase_admin')
    OR (
      caller_role IN ('', 'none')
      AND COALESCE(session_user, current_user) IN ('postgres', 'supabase_admin')
    )
  ) THEN
    SELECT public.get_identity_org_appid(
      '{read,upload,write,all}'::public.key_mode[],
      get_app_metrics.p_org_id,
      get_app_metrics.p_app_id
    )
    INTO caller_id;

    IF caller_id IS NULL OR NOT public.check_min_rights(
      'read'::public.user_min_right,
      caller_id,
      get_app_metrics.p_org_id,
      get_app_metrics.p_app_id,
      NULL::bigint
    ) THEN
      RETURN;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = get_app_metrics.p_app_id
      AND apps.owner_org = get_app_metrics.p_org_id
  ) INTO app_exists;

  IF NOT app_exists THEN
    RETURN;
  END IF;

  SELECT *
  INTO cache_entry
  FROM public.app_metrics_cache
  WHERE app_metrics_cache.org_id = get_app_metrics.p_org_id;

  IF cache_entry.id IS NULL
    OR cache_entry.start_date IS DISTINCT FROM get_app_metrics.p_start_date
    OR cache_entry.end_date IS DISTINCT FROM get_app_metrics.p_end_date
    OR cache_entry.cached_at IS NULL
    OR cache_entry.cached_at < (pg_catalog.now() - interval '5 minutes') THEN
    cache_entry := public.seed_get_app_metrics_caches(
      get_app_metrics.p_org_id,
      get_app_metrics.p_start_date,
      get_app_metrics.p_end_date
    );
  END IF;

  IF cache_entry.response IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    metrics.app_id,
    metrics.date,
    metrics.mau,
    metrics.storage,
    metrics.bandwidth,
    metrics.build_time_unit,
    metrics.get,
    metrics.fail,
    metrics.install,
    metrics.uninstall
  FROM pg_catalog.jsonb_to_recordset(cache_entry.response) AS metrics(
    app_id character varying,
    date date,
    mau bigint,
    storage bigint,
    bandwidth bigint,
    build_time_unit bigint,
    get bigint,
    fail bigint,
    install bigint,
    uninstall bigint
  )
  WHERE metrics.app_id = get_app_metrics.p_app_id
  ORDER BY metrics.date;
END;
$function$;

ALTER FUNCTION public.get_app_metrics(uuid, character varying, date, date)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_app_metrics(uuid, character varying, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_app_metrics(uuid, character varying, date, date) FROM anon;
REVOKE ALL ON FUNCTION public.get_app_metrics(uuid, character varying, date, date) FROM authenticated;
GRANT ALL ON FUNCTION public.get_app_metrics(uuid, character varying, date, date) TO anon;
GRANT ALL ON FUNCTION public.get_app_metrics(uuid, character varying, date, date) TO authenticated;
GRANT ALL ON FUNCTION public.get_app_metrics(uuid, character varying, date, date) TO service_role;
