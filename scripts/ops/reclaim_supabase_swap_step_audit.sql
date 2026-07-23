-- Capgo-EU reclaim step — audit_logs only. SQL Editor safe.
-- Re-run until Notice: deleted=0
SELECT public.cleanup_old_audit_logs(2, 200);
