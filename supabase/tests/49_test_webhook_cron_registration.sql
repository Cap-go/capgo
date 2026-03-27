BEGIN;

SELECT plan(1);

SELECT tests.authenticate_as_service_role();

SELECT ok(
    (
        SELECT count(*)::int
        FROM public.cron_tasks
        WHERE
            name = 'high_frequency_queues'
            AND enabled = TRUE
            AND task_type = 'function_queue'::public.cron_task_type
            AND target::jsonb ? 'webhook_dispatcher'
            AND target::jsonb ? 'webhook_delivery'
    ) = 1,
    'cron_tasks high_frequency_queues includes webhook dispatcher and delivery queues'
);

SELECT tests.clear_authentication();

SELECT * FROM finish(); -- noqa: AM04

ROLLBACK;
