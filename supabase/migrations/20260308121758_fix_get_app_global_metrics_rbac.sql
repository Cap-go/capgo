-- Harden app/global metrics RPC access:
-- - require org-level read access for all org_id overloads
-- - keep existing UUID-based signatures for compatibility

CREATE OR REPLACE FUNCTION public.get_app_metrics("org_id" uuid, "start_date" date, "end_date" date)
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
) LANGUAGE plpgsql STABLE
SET search_path TO '' AS $function$
DECLARE
    cache_entry public.app_metrics_cache%ROWTYPE;
    request_role text;
    org_exists boolean;
BEGIN
    request_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
    IF request_role IS NOT NULL AND request_role <> 'service_role' THEN
        IF NOT public.check_min_rights(
            'read'::public.user_min_right,
            public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], get_app_metrics.org_id),
            get_app_metrics.org_id,
            NULL::CHARACTER VARYING,
            NULL::BIGINT
        ) THEN
            RETURN;
        END IF;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.orgs WHERE id = get_app_metrics.org_id
    ) INTO org_exists;

    IF NOT org_exists THEN
        RETURN;
    END IF;

    SELECT *
    INTO cache_entry
    FROM public.app_metrics_cache
    WHERE app_metrics_cache.org_id = get_app_metrics.org_id;

    IF cache_entry.id IS NULL
        OR cache_entry.start_date IS DISTINCT FROM get_app_metrics.start_date
        OR cache_entry.end_date IS DISTINCT FROM get_app_metrics.end_date
        OR cache_entry.cached_at IS NULL
        OR cache_entry.cached_at < (NOW() - interval '5 minutes') THEN
        cache_entry := public.seed_get_app_metrics_caches(get_app_metrics.org_id, get_app_metrics.start_date, get_app_metrics.end_date);
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
    FROM jsonb_to_recordset(cache_entry.response) AS metrics(
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
    ORDER BY metrics.app_id, metrics.date;
END;
$function$;

ALTER FUNCTION public.get_app_metrics("org_id" uuid, "start_date" date, "end_date" date)
    OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_app_metrics("org_id" uuid)
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
) LANGUAGE plpgsql STABLE
SET search_path TO '' AS $function$
DECLARE
  request_role text;
  cycle_start timestamptz;
  cycle_end timestamptz;
BEGIN
    request_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
    IF request_role IS NOT NULL AND request_role <> 'service_role' THEN
        IF NOT public.check_min_rights(
            'read'::public.user_min_right,
            public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], get_app_metrics.org_id),
            get_app_metrics.org_id,
            NULL::CHARACTER VARYING,
            NULL::BIGINT
        ) THEN
            RETURN;
        END IF;
    END IF;

    SELECT subscription_anchor_start, subscription_anchor_end INTO cycle_start, cycle_end
    FROM public.get_cycle_info_org(org_id);
    RETURN QUERY SELECT * FROM public.get_app_metrics(org_id, cycle_start::date, cycle_end::date);
END;
$function$;

ALTER FUNCTION public.get_app_metrics("org_id" uuid)
    OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_global_metrics("org_id" uuid, "start_date" date, "end_date" date)
RETURNS TABLE(
    date date,
    mau bigint,
    storage bigint,
    bandwidth bigint,
    get bigint,
    fail bigint,
    install bigint,
    uninstall bigint
) LANGUAGE plpgsql
SET search_path TO '' AS $function$
DECLARE
  request_role text;
BEGIN
    request_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
    IF request_role IS NOT NULL AND request_role <> 'service_role' THEN
        IF NOT public.check_min_rights(
            'read'::public.user_min_right,
            public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], get_global_metrics.org_id),
            get_global_metrics.org_id,
            NULL::CHARACTER VARYING,
            NULL::BIGINT
        ) THEN
            RETURN;
        END IF;
    END IF;

    RETURN QUERY
    SELECT
        metrics.date,
        SUM(metrics.mau)::bigint AS mau,
        SUM(metrics.storage)::bigint AS storage,
        SUM(metrics.bandwidth)::bigint AS bandwidth,
        SUM(metrics.get)::bigint AS get,
        SUM(metrics.fail)::bigint AS fail,
        SUM(metrics.install)::bigint AS install,
        SUM(metrics.uninstall)::bigint AS uninstall
    FROM
        public.get_app_metrics(org_id, start_date, end_date) AS metrics
    GROUP BY
        metrics.date
    ORDER BY
        metrics.date;
END;
$function$;

ALTER FUNCTION public.get_global_metrics("org_id" uuid, "start_date" date, "end_date" date)
    OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_global_metrics("org_id" uuid)
RETURNS TABLE(
    date date,
    mau bigint,
    storage bigint,
    bandwidth bigint,
    get bigint,
    fail bigint,
    install bigint,
    uninstall bigint
) LANGUAGE plpgsql
SET search_path TO '' AS $function$
DECLARE
    request_role text;
    cycle_start timestamptz;
    cycle_end timestamptz;
BEGIN
    request_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
    IF request_role IS NOT NULL AND request_role <> 'service_role' THEN
        IF NOT public.check_min_rights(
            'read'::public.user_min_right,
            public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], get_global_metrics.org_id),
            get_global_metrics.org_id,
            NULL::CHARACTER VARYING,
            NULL::BIGINT
        ) THEN
            RETURN;
        END IF;
    END IF;

    SELECT subscription_anchor_start, subscription_anchor_end
    INTO cycle_start, cycle_end
    FROM public.get_cycle_info_org(org_id);

    RETURN QUERY
    SELECT * FROM public.get_global_metrics(org_id, cycle_start::date, cycle_end::date);
END;
$function$;

ALTER FUNCTION public.get_global_metrics("org_id" uuid)
    OWNER TO "postgres";
