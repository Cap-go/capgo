-- Add deleted_at column to track when versions were soft-deleted
-- This replaces using updated_at which is unreliable (touched by many operations)

-- Step 1: Add deleted_at column
ALTER TABLE public.app_versions
ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL;

-- Step 2: Migrate existing deleted versions
-- Use updated_at (which was set by previous retention logic) instead of created_at
-- to avoid premature hard-deletion of recently-deleted old versions
UPDATE public.app_versions
SET deleted_at = updated_at
WHERE deleted = true AND deleted_at IS NULL;

-- Step 3: Add index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_app_versions_deleted_at
  ON public.app_versions (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Step 4: Update retention function to set deleted_at when marking versions as deleted
CREATE OR REPLACE FUNCTION "public"."update_app_versions_retention" () RETURNS void LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    UPDATE public.app_versions
    SET deleted = true, deleted_at = NOW()
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

-- Step 5: Update hard-delete function to use deleted_at instead of updated_at
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
      AND deleted_at < NOW() - INTERVAL '1 year'
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

-- Step 6: Update delete_non_compliant_bundles to set deleted_at
-- This function is used to delete bundles that don't comply with encryption requirements
CREATE OR REPLACE FUNCTION "public"."delete_non_compliant_bundles"(
  "org_id" uuid,
  "required_key" text DEFAULT NULL
) RETURNS bigint
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  deleted_count bigint := 0;
  bundle_ids bigint[];
  caller_user_id uuid;
  caller_right public.user_min_right;
BEGIN
  -- Get the current user's ID (supports both JWT and API key authentication)
  SELECT public.get_identity('{read,upload,write,all}'::public.key_mode[]) INTO caller_user_id;

  IF caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required';
  END IF;

  -- Check if the caller is a super_admin of this organization
  SELECT user_right INTO caller_right
  FROM public.org_users
  WHERE org_users.user_id = caller_user_id
    AND org_users.org_id = delete_non_compliant_bundles.org_id;

  IF caller_right IS NULL OR caller_right <> 'super_admin'::public.user_min_right THEN
    RAISE EXCEPTION 'Unauthorized: Only super_admin can access this function';
  END IF;

  -- First, collect all bundle IDs that will be deleted
  IF required_key IS NULL OR required_key = '' THEN
    -- Only delete non-encrypted bundles
    SELECT ARRAY_AGG(av.id) INTO bundle_ids
    FROM public.app_versions av
    JOIN public.apps a ON a.app_id = av.app_id
    WHERE a.owner_org = delete_non_compliant_bundles.org_id
      AND av.deleted = false
      AND (av.session_key IS NULL OR av.session_key = '');
  ELSE
    -- Delete non-encrypted bundles AND bundles with wrong key
    SELECT ARRAY_AGG(av.id) INTO bundle_ids
    FROM public.app_versions av
    JOIN public.apps a ON a.app_id = av.app_id
    WHERE a.owner_org = delete_non_compliant_bundles.org_id
      AND av.deleted = false
      AND (
        -- Non-encrypted bundles
        (av.session_key IS NULL OR av.session_key = '')
        OR
        -- Encrypted but with wrong key
        (
          av.session_key IS NOT NULL
          AND av.session_key <> ''
          AND (
            av.key_id IS NULL
            OR av.key_id = ''
            OR NOT (av.key_id = LEFT(required_key, 20) OR LEFT(av.key_id, LENGTH(required_key)) = required_key)
          )
        )
      );
  END IF;

  -- If there are bundles to delete, mark them as deleted
  IF bundle_ids IS NOT NULL AND array_length(bundle_ids, 1) > 0 THEN
    UPDATE public.app_versions
    SET deleted = true, deleted_at = NOW()
    WHERE id = ANY(bundle_ids);

    deleted_count := array_length(bundle_ids, 1);

    -- Log the action
    PERFORM public.pg_log('action: DELETED_NON_COMPLIANT_BUNDLES',
      jsonb_build_object(
        'org_id', org_id,
        'required_key', required_key,
        'deleted_count', deleted_count,
        'bundle_ids', bundle_ids,
        'caller_user_id', caller_user_id
      ));
  END IF;

  RETURN deleted_count;
END;
$$;
