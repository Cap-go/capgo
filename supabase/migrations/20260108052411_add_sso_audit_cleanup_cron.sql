-- Add SSO audit log cleanup to cron tasks for PII compliance
-- Runs daily at 3:00 AM UTC to delete logs older than 90 days and anonymize deleted users' emails

INSERT INTO public.cron_tasks (
    name,
    description,
    task_type,
    target,
    run_at_hour,
    run_at_minute,
    enabled
) VALUES (
    'sso_audit_cleanup',
    'Cleanup old SSO audit logs (90+ days) and anonymize PII for deleted users (GDPR/CCPA compliance)',
    'function',
    'public.cleanup_old_sso_audit_logs()',
    3,  -- 3 AM UTC
    0,  -- 0 minutes
    true
)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    task_type = EXCLUDED.task_type,
    target = EXCLUDED.target,
    run_at_hour = EXCLUDED.run_at_hour,
    run_at_minute = EXCLUDED.run_at_minute,
    enabled = EXCLUDED.enabled;

COMMENT ON TABLE public.sso_audit_logs IS 'Audit trail for all SSO authentication and configuration events. Auto-cleanup: logs older than 90 days are deleted daily at 3 AM UTC. PII (email) is anonymized for deleted users.';
