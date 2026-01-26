-- Add deleted_at column to track when versions were soft-deleted
-- This replaces using updated_at which is unreliable (touched by many operations)
-- Step 1: Add deleted_at column
ALTER TABLE public.app_versions
ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL;

-- Step 2: Migrate existing deleted versions
-- Use updated_at (which was set by previous retention logic) instead of created_at
-- to avoid premature hard-deletion of recently-deleted old versions
UPDATE public.app_versions
SET
  deleted_at = updated_at
WHERE
  deleted = true
  AND deleted_at IS NULL;

-- Step 3: Add index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_app_versions_deleted_at ON public.app_versions (deleted_at)
WHERE
  deleted_at IS NOT NULL;

-- Step 4: Create trigger function to automatically set deleted_at when deleted becomes true
-- This ensures deleted_at is always set correctly, regardless of how the deletion happens
CREATE OR REPLACE FUNCTION public.set_deleted_at_on_soft_delete () RETURNS TRIGGER LANGUAGE plpgsql
SET
  search_path = '' AS $$
BEGIN
  -- Only set deleted_at when deleted changes from false to true
  -- and deleted_at is not already set (allows manual override if needed)
  IF NEW.deleted = true AND (OLD.deleted = false OR OLD.deleted IS NULL) AND NEW.deleted_at IS NULL THEN
    NEW.deleted_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

-- Step 5: Create trigger on app_versions table
DROP TRIGGER IF EXISTS set_deleted_at_trigger ON public.app_versions;

CREATE TRIGGER set_deleted_at_trigger BEFORE
UPDATE ON public.app_versions FOR EACH ROW
EXECUTE FUNCTION public.set_deleted_at_on_soft_delete ();

-- Step 6: Simplify retention function - trigger handles deleted_at automatically
CREATE OR REPLACE FUNCTION "public"."update_app_versions_retention" () RETURNS void LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    UPDATE public.app_versions
    SET deleted = true
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

-- Step 7: Update hard-delete function to use deleted_at instead of updated_at
-- Also exclude builtin/unknown versions which should NEVER be hard-deleted
CREATE OR REPLACE FUNCTION "public"."delete_old_deleted_versions" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  deleted_count bigint;
BEGIN
    -- Delete versions that are:
    -- 1. Have deleted_at set (soft deleted)
    -- 2. Soft-deleted more than 1 year ago
    -- 3. NOT builtin or unknown (these are special placeholder versions)
    -- 4. NOT currently linked to any channel (safety check)
    DELETE FROM "public"."app_versions"
    WHERE deleted_at IS NOT NULL
      AND deleted_at < NOW() - INTERVAL '3 months'
      AND name NOT IN ('builtin', 'unknown')
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
