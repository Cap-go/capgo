-- Auto-delete demo apps after 14 days
-- Demo apps are identified by app_id starting with 'com.capdemo.'
-- Uses existing created_at column to determine age
-- All related data is cleaned up via CASCADE foreign keys + on_app_delete trigger

-- Simple function that deletes expired demo apps
-- CASCADE handles related data cleanup, on_app_delete trigger handles S3/storage cleanup
CREATE OR REPLACE FUNCTION public.cleanup_expired_demo_apps() RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
    deleted_count bigint;
BEGIN
    DELETE FROM public.apps
    WHERE app_id LIKE 'com.capdemo.%'
      AND created_at < NOW() - INTERVAL '14 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'cleanup_expired_demo_apps: Deleted % expired demo apps', deleted_count;
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
    'Delete demo apps (app_id starts with com.capdemo.) older than 14 days',
    'function',
    'public.cleanup_expired_demo_apps()',
    null,
    null,
    null,
    null,
    3,     -- run_at_hour (03:00 UTC)
    0,     -- run_at_minute
    0,     -- run_at_second
    null,
    null
)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    task_type = EXCLUDED.task_type,
    target = EXCLUDED.target,
    run_at_hour = EXCLUDED.run_at_hour,
    run_at_minute = EXCLUDED.run_at_minute,
    run_at_second = EXCLUDED.run_at_second,
    updated_at = NOW();
