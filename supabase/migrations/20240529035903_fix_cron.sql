SELECT cron.schedule(
    'process_requests_from_queue',
    '5 seconds',
    $$SELECT process_requested_jobs()$$
);

SELECT cron.schedule(
    'process_current_jobs_if_unlocked',
    '5 seconds',
    $$SELECT process_current_jobs_if_unlocked();$$
);

SELECT cron.schedule(
    'delete_failed_jobs',
    '42 0 * * *',
    $$SELECT delete_failed_jobs();$$
);

SELECT cron.schedule(
    'process_cron_stats_jobs',
    '0 2 * * *',
    $$SELECT process_cron_stats_jobs();$$
);

SELECT cron.schedule(
    'process_subscribed_orgs',
    '0 3 * * *',
    $$SELECT process_subscribed_orgs();$$
);

SELECT cron.schedule(
    'process_free_trial_expired',
    '0 0 * * *',
    $$SELECT process_free_trial_expired();$$
);

DO $$
begin
execute (
    select string_agg('INSERT INTO workers DEFAULT VALUES',';')
    from generate_series(1,10)
);
end; 
$$;
