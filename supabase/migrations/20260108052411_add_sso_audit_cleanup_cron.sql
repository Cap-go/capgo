-- Add SSO audit log cleanup cron task for PII compliance
-- Runs daily at 3:00 AM UTC to delete logs older than 90 days and anonymize deleted users' emails

INSERT INTO
    public.cron_tasks (
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
        run_on_day,
        enabled
    )
VALUES (
        'sso_audit_cleanup',
        'Clean up SSO audit logs older than 90 days and anonymize PII for deleted users',
        'function',
        'public.cleanup_old_sso_audit_logs',
        null, -- batch_size (not applicable for function calls)
        null, -- second_interval
        null, -- minute_interval
        null, -- hour_interval
        3, -- run_at_hour (3:00 AM UTC)
        0, -- run_at_minute
        null, -- run_at_second
        null, -- run_on_dow (any day of week)
        null, -- run_on_day (any day of month)
        true -- enabled
    );

-- Add descriptive comment to sso_audit_logs table
COMMENT ON
TABLE public.sso_audit_logs IS 'Audit trail for all SSO authentication and configuration events. Auto-cleanup: logs older than 90 days are deleted daily at 3 AM UTC. PII (email) is anonymized for deleted users.';