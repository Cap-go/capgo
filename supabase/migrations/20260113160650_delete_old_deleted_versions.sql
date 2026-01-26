-- Fix: update_app_versions_retention should set updated_at when marking versions as deleted
-- This ensures we can track when a version was soft-deleted
CREATE OR REPLACE FUNCTION "public"."update_app_versions_retention" () RETURNS void LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    -- Use a more efficient approach with direct timestamp comparison
    -- Also set updated_at to track when the version was marked as deleted
    UPDATE public.app_versions
    SET deleted = true, updated_at = NOW()
    WHERE app_versions.deleted = false
      AND (SELECT retention FROM public.apps WHERE apps.app_id = app_versions.app_id) >= 0
      AND (SELECT retention FROM public.apps WHERE apps.app_id = app_versions.app_id) < 63113904
      AND app_versions.created_at < (
          SELECT NOW() - make_interval(secs => apps.retention)
          FROM public.apps
          WHERE apps.app_id = app_versions.app_id
      )
      AND NOT EXISTS (
          SELECT 1
          FROM public.channels
          WHERE channels.app_id = app_versions.app_id
            AND channels.version = app_versions.id
      );
END;
$$;

-- Create a function to permanently delete app versions that are:
-- 1. Already marked as deleted (soft deleted)
-- 2. Soft-deleted more than one year ago (using updated_at, not created_at)
-- This helps with database cleanup and compliance with data retention policies.
-- Note: Foreign keys have ON DELETE CASCADE, so related records in
-- app_versions_meta, channels, deploy_history, and manifest will be automatically cleaned up.

CREATE OR REPLACE FUNCTION "public"."delete_old_deleted_versions" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  deleted_count bigint;
BEGIN
    -- Delete versions that are:
    -- 1. Marked as deleted (soft deleted)
    -- 2. Soft-deleted more than 1 year ago (based on updated_at, which is set when deleted=true)
    -- 3. NOT currently linked to any channel (safety check, though should not happen for deleted versions)
    DELETE FROM "public"."app_versions"
    WHERE deleted = true
      AND updated_at < NOW() - INTERVAL '1 year'
      AND NOT EXISTS (
        SELECT 1 FROM "public"."channels"
        WHERE channels.version = app_versions.id
      );

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    IF deleted_count > 0 THEN
      RAISE NOTICE 'delete_old_deleted_versions: permanently deleted % app versions', deleted_count;
    END IF;
END;
$$;

ALTER FUNCTION "public"."delete_old_deleted_versions" () OWNER TO "postgres";

-- Security: internal function only
REVOKE EXECUTE ON FUNCTION "public"."delete_old_deleted_versions" () FROM public;
GRANT EXECUTE ON FUNCTION "public"."delete_old_deleted_versions" () TO service_role;

-- Add to cron_tasks table to run daily at 03:00:00
-- Runs AFTER:
--   - 00:40 update_app_versions_retention() marks versions as deleted
--   - 02:00 cron_clear_versions queue processes S3 cleanup
-- Scheduled at 03:00 to ensure S3 cleanup is complete before hard deletion
INSERT INTO public.cron_tasks (
    name,
    description,
    task_type,
    target,
    batch_size,
    second_interval,
    minute_interval,
    hour_interval,
    run_at_hour,
    run_at_minute,
    run_at_second,
    run_on_dow,
    run_on_day
) VALUES (
    'delete_old_versions',
    'Permanently delete app versions that are soft-deleted and older than 1 year',
    'function',
    'public.delete_old_deleted_versions()',
    null,   -- batch_size (not needed for function type)
    null,   -- second_interval
    null,   -- minute_interval
    null,   -- hour_interval
    3,      -- run_at_hour: 03:00 (after S3 cleanup at 02:00)
    0,      -- run_at_minute
    0,      -- run_at_second
    null,   -- run_on_dow (no day-of-week restriction)
    null    -- run_on_day (no day-of-month restriction)
);
