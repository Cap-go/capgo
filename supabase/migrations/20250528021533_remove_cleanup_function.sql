-- unschedule process_cron_clear_versions_queue this should be only run manually
select cron.unschedule('process_cron_clear_versions_queue');
select cron.unschedule('process_failed_uploads');
