-- Ensure audit_logs retention stays at 90 days and is registered in the
-- table-driven cron runner.
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM "public"."audit_logs"
  WHERE created_at < pg_catalog.now() - INTERVAL '90 days';
END;
$$;

ALTER FUNCTION public.cleanup_old_audit_logs() OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.cleanup_old_audit_logs() FROM public;
REVOKE ALL ON FUNCTION public.cleanup_old_audit_logs() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_old_audit_logs() FROM authenticated;
GRANT ALL ON FUNCTION public.cleanup_old_audit_logs() TO service_role;

INSERT INTO public.cron_tasks (
    name,
    description,
    task_type,
    target,
    batch_size,
    payload,
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
    'cleanup_old_audit_logs',
    'Delete audit_logs older than 90 days',
    'function'::public.cron_task_type,
    'public.cleanup_old_audit_logs()',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    3,
    0,
    0,
    NULL,
    NULL,
    TRUE
)
ON CONFLICT (name) DO UPDATE SET
    description = excluded.description,
    task_type = excluded.task_type,
    target = excluded.target,
    batch_size = excluded.batch_size,
    payload = excluded.payload,
    second_interval = excluded.second_interval,
    minute_interval = excluded.minute_interval,
    hour_interval = excluded.hour_interval,
    run_at_hour = excluded.run_at_hour,
    run_at_minute = excluded.run_at_minute,
    run_at_second = excluded.run_at_second,
    run_on_dow = excluded.run_on_dow,
    run_on_day = excluded.run_on_day,
    enabled = excluded.enabled,
    updated_at = pg_catalog.now();
