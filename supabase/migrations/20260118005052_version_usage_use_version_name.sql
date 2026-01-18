-- Migration: Use version_name instead of version_id for version statistics
-- This allows tracking version stats without database lookups

-- 1. Add version_name column to version_usage table (nullable for backwards compatibility with old data)
ALTER TABLE "public"."version_usage" ADD COLUMN IF NOT EXISTS "version_name" character varying(255);

-- 2. Add version_name column to daily_version table (nullable for backwards compatibility with old data)
ALTER TABLE "public"."daily_version" ADD COLUMN IF NOT EXISTS "version_name" character varying(255);

-- 3. Backfill version_name in daily_version from app_versions (for existing data)
UPDATE "public"."daily_version" dv
SET version_name = av.name
FROM "public"."app_versions" av
WHERE dv.version_id = av.id AND dv.version_name IS NULL;

-- 4. Drop and recreate read_version_usage function with new return type (version_name instead of version_id)
-- PostgreSQL doesn't allow changing return type with CREATE OR REPLACE, so we must drop first
DROP FUNCTION IF EXISTS "public"."read_version_usage"(character varying, timestamp without time zone, timestamp without time zone);

-- Recreate function with version_name in return type
-- It now handles both old data (with version_id) and new data (with version_name)
CREATE FUNCTION "public"."read_version_usage"(
    "p_app_id" character varying,
    "p_period_start" timestamp without time zone,
    "p_period_end" timestamp without time zone
) RETURNS TABLE(
    "app_id" character varying,
    "version_name" character varying,
    "date" timestamp without time zone,
    "get" bigint,
    "fail" bigint,
    "install" bigint,
    "uninstall" bigint
)
LANGUAGE "plpgsql"
SET "search_path" TO ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vu.app_id,
    -- Use version_name if available (new data), otherwise look up from app_versions (old data)
    COALESCE(vu.version_name, av.name)::character varying as version_name,
    DATE_TRUNC('day', vu.timestamp) AS date,
    SUM(CASE WHEN vu.action = 'get' THEN 1 ELSE 0 END) AS get,
    SUM(CASE WHEN vu.action = 'fail' THEN 1 ELSE 0 END) AS fail,
    SUM(CASE WHEN vu.action = 'install' THEN 1 ELSE 0 END) AS install,
    SUM(CASE WHEN vu.action = 'uninstall' THEN 1 ELSE 0 END) AS uninstall
  FROM public.version_usage vu
  LEFT JOIN public.app_versions av ON vu.version_id = av.id AND vu.version_name IS NULL
  WHERE
    vu.app_id = p_app_id
    AND vu.timestamp >= p_period_start
    AND vu.timestamp < p_period_end
  GROUP BY date, vu.app_id, COALESCE(vu.version_name, av.name)
  ORDER BY date;
END;
$$;

-- 5. Create index on version_name for better query performance
CREATE INDEX IF NOT EXISTS "idx_version_usage_version_name" ON "public"."version_usage" ("version_name");
CREATE INDEX IF NOT EXISTS "idx_daily_version_version_name" ON "public"."daily_version" ("version_name");

-- 6. Add unique constraint on (app_id, date, version_name) for upsert operations
-- First drop the old primary key constraint since we're changing the conflict key
-- Note: We keep version_id for backwards compatibility but add version_name as unique
CREATE UNIQUE INDEX IF NOT EXISTS "idx_daily_version_app_date_version_name_unique" ON "public"."daily_version" ("app_id", "date", "version_name") WHERE "version_name" IS NOT NULL;
