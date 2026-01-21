-- Auto-delete demo apps after 14 days
-- Demo apps are identified by app_id starting with 'com.demo.'
-- Uses existing created_at column to determine age

-- Create the cleanup function for expired demo apps
-- This function mirrors the cleanup logic from the deleteApp TypeScript function
-- to ensure all related data is properly removed (not all tables have CASCADE)
CREATE OR REPLACE FUNCTION public.cleanup_expired_demo_apps() RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
    deleted_count bigint := 0;
    app_record RECORD;
BEGIN
    -- Log start of cleanup
    RAISE NOTICE 'cleanup_expired_demo_apps: Starting cleanup of expired demo apps';

    -- Process each expired demo app (app_id starts with 'com.demo.' and older than 14 days)
    FOR app_record IN
        SELECT app_id, owner_org, name, created_at
        FROM public.apps
        WHERE app_id LIKE 'com.demo.%'
          AND created_at < NOW() - INTERVAL '14 days'
    LOOP
        RAISE NOTICE 'cleanup_expired_demo_apps: Deleting expired demo app % (org: %, created: %)',
            app_record.app_id, app_record.owner_org, app_record.created_at;

        -- Delete related data first (these tables may not have CASCADE on FK)
        -- This mirrors the deleteApp TypeScript function logic

        -- Delete version related data
        DELETE FROM public.app_versions_meta WHERE app_id = app_record.app_id;
        DELETE FROM public.daily_version WHERE app_id = app_record.app_id;
        DELETE FROM public.version_usage WHERE app_id = app_record.app_id;

        -- Delete app related data
        DELETE FROM public.channel_devices WHERE app_id = app_record.app_id;
        DELETE FROM public.channels WHERE app_id = app_record.app_id;
        DELETE FROM public.devices WHERE app_id = app_record.app_id;

        -- Delete usage stats
        DELETE FROM public.bandwidth_usage WHERE app_id = app_record.app_id;
        DELETE FROM public.storage_usage WHERE app_id = app_record.app_id;
        DELETE FROM public.device_usage WHERE app_id = app_record.app_id;

        -- Delete daily metrics
        DELETE FROM public.daily_mau WHERE app_id = app_record.app_id;
        DELETE FROM public.daily_bandwidth WHERE app_id = app_record.app_id;
        DELETE FROM public.daily_storage WHERE app_id = app_record.app_id;

        -- Delete stats
        DELETE FROM public.stats WHERE app_id = app_record.app_id;

        -- Delete org_users with this app_id
        DELETE FROM public.org_users WHERE app_id = app_record.app_id;

        -- Delete deploy_history
        DELETE FROM public.deploy_history WHERE app_id = app_record.app_id;

        -- Delete versions
        DELETE FROM public.app_versions WHERE app_id = app_record.app_id;

        -- Finally delete the app
        DELETE FROM public.apps WHERE app_id = app_record.app_id;

        deleted_count := deleted_count + 1;
        RAISE NOTICE 'cleanup_expired_demo_apps: Successfully deleted demo app %', app_record.app_id;
    END LOOP;

    RAISE NOTICE 'cleanup_expired_demo_apps: Cleanup complete, deleted % demo apps', deleted_count;
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
    'Delete demo apps (app_id starts with com.demo.) older than 14 days',
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
