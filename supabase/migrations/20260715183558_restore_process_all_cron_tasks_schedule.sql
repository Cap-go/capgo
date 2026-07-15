-- The squashed baseline is already applied in existing environments, so ensure
-- its scheduler registration is restored with a forward-only migration.
SELECT
    cron.schedule(
        'process_all_cron_tasks',
        '10 seconds',
        $job$SELECT public.process_all_cron_tasks();$job$
    )
WHERE NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'process_all_cron_tasks'
);
