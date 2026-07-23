-- Capgo-EU reclaim step — queues only. SQL Editor safe.
-- Re-run until Notice: archived_deleted=0 and stuck_deleted=0
SELECT public.cleanup_queue_messages(1, 500);
