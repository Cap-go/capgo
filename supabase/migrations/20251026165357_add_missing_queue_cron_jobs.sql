-- Add missing cron jobs for queues that were created but never had processing scheduled
-- This fixes the issue where on_user_delete and cron_clear_versions queues would accumulate
-- messages but never process them.
-- Schedule cron job to process on_user_delete queue
-- This queue handles cleanup when users are deleted (cancel subscriptions, unsubscribe from Bento)
-- Running every 10 seconds like other user-related queues
SELECT
  cron.schedule (
    'process_user_delete_queue',
    '10 seconds',
    'SELECT public.process_function_queue(''on_user_delete'')'
  );

-- Schedule cron job to process cron_clear_versions queue
-- This queue handles cleanup of old versions
-- Running every 2 hours like other cleanup tasks
SELECT
  cron.schedule (
    'process_cron_clear_versions_queue',
    '0 */2 * * *',
    'SELECT public.process_function_queue(''cron_clear_versions'')'
  );
