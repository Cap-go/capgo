-- Add SSO audit log cleanup to process_all_cron_tasks function for PII compliance
-- Runs daily at 3:00 AM UTC to delete logs older than 90 days and anonymize deleted users' emails
-- Per Capgo convention: do NOT add rows to cron_tasks table, only update process_all_cron_tasks()

COMMENT ON
TABLE public.sso_audit_logs IS 'Audit trail for all SSO authentication and configuration events. Auto-cleanup: logs older than 90 days are deleted daily at 3 AM UTC. PII (email) is anonymized for deleted users.';