-- remove hack to run subminute cron jobs
SELECT cron.unschedule('process_tasks_subminute' );
-- call process_current_jobs_if_unlocked every 20 seconds
SELECT cron.schedule(
    'process_current_jobs_if_unlocked',
    '20 seconds',
    $$SELECT process_current_jobs_if_unlocked();$$
);
drop function schedule_jobs;
