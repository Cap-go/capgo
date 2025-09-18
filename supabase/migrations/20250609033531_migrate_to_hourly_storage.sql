-- Create storage_hourly_cache table
CREATE TABLE storage_hourly_cache (
    id BIGSERIAL PRIMARY KEY,
    app_id TEXT NOT NULL REFERENCES apps(app_id) ON DELETE CASCADE,
    cache JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on app_id for better query performance
CREATE UNIQUE INDEX idx_storage_hourly_cache_app_id ON storage_hourly_cache(app_id);

-- Create index on created_at for time-based queries
CREATE INDEX idx_storage_hourly_cache_created_at ON storage_hourly_cache(created_at);


-- Create storage_hourly table
CREATE TABLE storage_hourly (
    id BIGSERIAL PRIMARY KEY,
    app_id TEXT NOT NULL REFERENCES apps(app_id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    size BIGINT NOT NULL
);

-- Create index on app_id for better query performance
CREATE INDEX idx_storage_hourly_app_id ON storage_hourly(app_id);

-- Create index on date for time-based queries
CREATE INDEX idx_storage_hourly_date ON storage_hourly(date);

-- Create unique index on app_id and date to prevent duplicates
CREATE UNIQUE INDEX idx_storage_hourly_app_id_date ON storage_hourly(app_id, date);

-- Enable RLS for both tables
ALTER TABLE storage_hourly_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_hourly ENABLE ROW LEVEL SECURITY;

UPDATE plans set storage = plans.storage * 31 * 24;


CREATE OR REPLACE FUNCTION "public"."get_app_metrics_v2" (
  "org_id" "uuid",
  "start_date" "date",
  "end_date" "date"
) RETURNS TABLE (
  "app_id" character varying,
  "date" "date",
  "mau" bigint,
  "storage" bigint,
  "bandwidth" bigint,
  "get" bigint,
  "fail" bigint,
  "install" bigint,
  "uninstall" bigint
) LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH DateSeries AS (
        SELECT generate_series(start_date, end_date, '1 day'::interval)::date AS "date"
    ),
    all_apps AS (
        -- Get active apps
        SELECT apps.app_id, apps.owner_org
        FROM public.apps
        WHERE apps.owner_org = org_id
        UNION
        -- Get deleted apps
        SELECT deleted_apps.app_id, deleted_apps.owner_org
        FROM public.deleted_apps
        WHERE deleted_apps.owner_org = org_id
    ),
    deleted_metrics AS (
        SELECT
            deleted_apps.app_id,
            deleted_apps.deleted_at::date as date,
            COUNT(*) as deleted_count
        FROM public.deleted_apps
        WHERE deleted_apps.owner_org = org_id
        AND deleted_apps.deleted_at::date BETWEEN start_date AND end_date
        GROUP BY deleted_apps.app_id, deleted_apps.deleted_at::date
    )
    SELECT
        aa.app_id,
        ds.date::date,
        COALESCE(dm.mau, 0) AS mau,
        COALESCE(dst.storage, 0) AS storage,
        COALESCE(db.bandwidth, 0) AS bandwidth,
        COALESCE(SUM(dv.get)::bigint, 0) AS get,
        COALESCE(SUM(dv.fail)::bigint, 0) AS fail,
        COALESCE(SUM(dv.install)::bigint, 0) AS install,
        COALESCE(SUM(dv.uninstall)::bigint, 0) AS uninstall
    FROM
        all_apps aa
    CROSS JOIN
        DateSeries ds
    LEFT JOIN
        public.daily_mau dm ON aa.app_id = dm.app_id AND ds.date = dm.date
    LEFT JOIN LATERAL (
        SELECT sh.size as storage
        FROM public.storage_hourly sh
        WHERE sh.app_id = aa.app_id 
        AND (
            -- Check for midnight of next day first (most accurate end-of-day value)
            (sh.date = (ds.date + INTERVAL '1 day')::date AND EXTRACT(HOUR FROM sh.date) = 0)
            OR 
            -- Otherwise get latest from current date
            sh.date::date = ds.date
        )
        ORDER BY 
            CASE 
                WHEN sh.date::date = (ds.date + INTERVAL '1 day')::date AND EXTRACT(HOUR FROM sh.date) = 0 THEN 1
                ELSE 2
            END,
            sh.date DESC
        LIMIT 1
    ) dst ON true
    LEFT JOIN 
        public.daily_bandwidth db ON aa.app_id = db.app_id AND ds.date = db.date
    LEFT JOIN
        public.daily_version dv ON aa.app_id = dv.app_id AND ds.date = dv.date
    LEFT JOIN
        deleted_metrics del ON aa.app_id = del.app_id AND ds.date = del.date
    GROUP BY
        aa.app_id, ds.date, dm.mau, dst.storage, db.bandwidth, del.deleted_count
    ORDER BY
        aa.app_id, ds.date;
END;
$$;

ALTER FUNCTION "public"."get_app_metrics_v2" ("org_id" "uuid") OWNER TO "postgres";