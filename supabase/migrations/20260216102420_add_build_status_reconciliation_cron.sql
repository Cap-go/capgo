SELECT pgmq.create('cron_reconcile_build_status');

INSERT INTO public.cron_tasks (
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
    run_on_day
) VALUES (
    'reconcile_build_status',
    'Send build status reconciliation job to queue every 15 minutes',
    'queue',
    'cron_reconcile_build_status',
    null,
    null,
    15,
    null,
    null,
    null,
    0,
    null,
    null
)
ON CONFLICT (name) DO UPDATE SET
    description = excluded.description,
    task_type = excluded.task_type,
    target = excluded.target,
    minute_interval = excluded.minute_interval,
    run_at_second = excluded.run_at_second,
    updated_at = NOW();

INSERT INTO public.cron_tasks (
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
    run_on_day
) VALUES (
    'reconcile_build_status_queue',
    'Process build status reconciliation queue',
    'function_queue',
    '["cron_reconcile_build_status"]',
    null,
    null,
    1,
    null,
    null,
    null,
    0,
    null,
    null
)
ON CONFLICT (name) DO UPDATE SET
    description = excluded.description,
    task_type = excluded.task_type,
    target = excluded.target,
    minute_interval = excluded.minute_interval,
    run_at_second = excluded.run_at_second,
    updated_at = NOW();
