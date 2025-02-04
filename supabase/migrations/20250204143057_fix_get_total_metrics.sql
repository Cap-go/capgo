CREATE OR REPLACE FUNCTION "public"."get_total_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") RETURNS TABLE("mau" bigint, "storage" bigint, "bandwidth" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(metrics.mau), 0)::bigint AS mau,
        COALESCE(get_total_storage_size_org(org_id), 0)::bigint AS storage,
        COALESCE(SUM(metrics.bandwidth), 0)::bigint AS bandwidth,
        COALESCE(SUM(metrics.get), 0)::bigint AS get,
        COALESCE(SUM(metrics.fail), 0)::bigint AS fail,
        COALESCE(SUM(metrics.install), 0)::bigint AS install,
        COALESCE(SUM(metrics.uninstall), 0)::bigint AS uninstall
    FROM
        get_app_metrics(org_id, start_date, end_date) AS metrics;
END;
$$;