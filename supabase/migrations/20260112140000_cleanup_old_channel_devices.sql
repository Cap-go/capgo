-- Add cleanup function for channel_devices older than one month
-- This removes stale entries from older plugin versions that stored channel assignments server-side
-- Newer plugins (v5.34.0+) store channel assignments locally and don't need this table

-- Create the cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_old_channel_devices() RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
    deleted_count bigint;
    purged_count bigint;
BEGIN
    -- Disable triggers on channel_devices to avoid unnecessary queue operations during bulk cleanup
    -- This prevents the enqueue_channel_device_counts trigger from firing for each deleted row
    ALTER TABLE public.channel_devices DISABLE TRIGGER channel_device_count_enqueue;

    -- Use nested block with exception handler to ensure trigger is re-enabled on any failure
    BEGIN
        -- Delete channel_devices where the last activity (updated_at or created_at) is older than 1 month
        DELETE FROM public.channel_devices
        WHERE COALESCE(updated_at, created_at) < NOW() - INTERVAL '1 month';

        GET DIAGNOSTICS deleted_count = ROW_COUNT;

        -- Re-enable triggers before any further operations
        ALTER TABLE public.channel_devices ENABLE TRIGGER channel_device_count_enqueue;

        IF deleted_count > 0 THEN
            RAISE NOTICE 'cleanup_old_channel_devices: Deleted % stale channel device entries', deleted_count;

            -- Purge any pending messages in the channel_device_counts queue before recomputing
            -- This prevents stale deltas from being applied after the full recount
            SELECT pgmq.purge_queue('channel_device_counts') INTO purged_count;
            IF purged_count > 0 THEN
                RAISE NOTICE 'cleanup_old_channel_devices: Purged % pending queue messages', purged_count;
            END IF;

            -- Recalculate channel_device_count for all apps since we bypassed the trigger
            -- This is more efficient than firing triggers for potentially thousands of rows
            UPDATE public.apps
            SET channel_device_count = COALESCE((
                SELECT COUNT(*)
                FROM public.channel_devices cd
                WHERE cd.app_id = apps.app_id
            ), 0);

            RAISE NOTICE 'cleanup_old_channel_devices: Recalculated channel_device_count for all apps';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Ensure trigger is re-enabled even on failure
        ALTER TABLE public.channel_devices ENABLE TRIGGER channel_device_count_enqueue;
        RAISE;
    END;
END;
$$;

-- Security: internal function only
REVOKE EXECUTE ON FUNCTION public.cleanup_old_channel_devices() FROM public;
GRANT EXECUTE ON FUNCTION public.cleanup_old_channel_devices() TO service_role;

-- Register cron task to run cleanup daily at 02:30:00 UTC
-- Note: The cron_tasks table is the canonical way to register tasks in this codebase.
-- The process_all_cron_tasks function reads from this table to execute scheduled tasks.
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
    'cleanup_old_channel_devices',
    'Delete channel_devices older than one month',
    'function',
    'public.cleanup_old_channel_devices()',
    null,  -- batch_size not needed for function type
    null,  -- second_interval
    null,  -- minute_interval
    null,  -- hour_interval
    2,     -- run_at_hour (02:00 UTC)
    30,    -- run_at_minute (02:30)
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
