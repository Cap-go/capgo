-- Add demo app support with auto-deletion after 14 days
-- Demo apps allow non-technical users to explore Capgo without CLI setup

-- Add is_demo column to apps table
ALTER TABLE public.apps ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false NOT NULL;

-- Add demo_expires_at column to apps table (only set for demo apps)
ALTER TABLE public.apps ADD COLUMN IF NOT EXISTS demo_expires_at timestamp with time zone;

-- Add index for efficient cleanup query
CREATE INDEX IF NOT EXISTS idx_apps_demo_expires_at ON public.apps (demo_expires_at) WHERE demo_expires_at IS NOT NULL;

-- Create the cleanup function for expired demo apps
CREATE OR REPLACE FUNCTION public.cleanup_expired_demo_apps() RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
    deleted_count bigint;
    app_record RECORD;
BEGIN
    -- Log start of cleanup
    RAISE NOTICE 'cleanup_expired_demo_apps: Starting cleanup of expired demo apps';

    -- Delete expired demo apps and their related data
    -- The CASCADE on foreign keys will handle related tables (app_versions, channels, etc.)
    FOR app_record IN
        SELECT app_id, owner_org, name, demo_expires_at
        FROM public.apps
        WHERE is_demo = true
          AND demo_expires_at IS NOT NULL
          AND demo_expires_at < NOW()
    LOOP
        RAISE NOTICE 'cleanup_expired_demo_apps: Deleting expired demo app % (org: %, expired: %)',
            app_record.app_id, app_record.owner_org, app_record.demo_expires_at;

        -- Delete the app (cascades will handle related tables)
        DELETE FROM public.apps WHERE app_id = app_record.app_id;

        GET DIAGNOSTICS deleted_count = ROW_COUNT;

        IF deleted_count > 0 THEN
            RAISE NOTICE 'cleanup_expired_demo_apps: Successfully deleted demo app %', app_record.app_id;
        END IF;
    END LOOP;

    -- Get total count of deleted apps
    SELECT COUNT(*) INTO deleted_count
    FROM public.apps
    WHERE is_demo = true
      AND demo_expires_at IS NOT NULL
      AND demo_expires_at < NOW();

    RAISE NOTICE 'cleanup_expired_demo_apps: Cleanup complete';
END;
$$;

-- Security: internal function only
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_demo_apps() FROM public;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_demo_apps() TO service_role;

-- Register cron task to run cleanup daily at 03:00:00 UTC
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
    'cleanup_expired_demo_apps',
    'Delete demo apps that have expired (14 days after creation)',
    'function',
    'public.cleanup_expired_demo_apps()',
    null,  -- batch_size not needed for function type
    null,  -- second_interval
    null,  -- minute_interval
    null,  -- hour_interval
    3,     -- run_at_hour (03:00 UTC)
    0,     -- run_at_minute
    0,     -- run_at_second
    null,  -- run_on_dow (any day)
    null   -- run_on_day (any day)
)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    task_type = EXCLUDED.task_type,
    target = EXCLUDED.target,
    run_at_hour = EXCLUDED.run_at_hour,
    run_at_minute = EXCLUDED.run_at_minute,
    run_at_second = EXCLUDED.run_at_second,
    updated_at = NOW();

-- Add comment explaining the columns
COMMENT ON COLUMN public.apps.is_demo IS 'Whether this app is a demo app created for non-technical users during onboarding';
COMMENT ON COLUMN public.apps.demo_expires_at IS 'When this demo app will be automatically deleted (14 days after creation for demo apps)';
