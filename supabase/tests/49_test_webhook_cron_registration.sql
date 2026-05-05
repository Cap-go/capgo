BEGIN;

SELECT plan(2);

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

SELECT ok(
    (
        WITH queue_order AS (
            SELECT value, ordinality
            FROM public.cron_tasks,
                jsonb_array_elements_text(target::jsonb) WITH ORDINALITY AS queue_items(value, ordinality)
            WHERE name = 'high_frequency_queues'
        )
        SELECT
            MAX(CASE WHEN value = 'webhook_dispatcher' THEN ordinality END)
            < MAX(CASE WHEN value = 'webhook_delivery' THEN ordinality END)
        FROM queue_order
    ),
    'cron_tasks high_frequency_queues processes webhook dispatcher before delivery'
);

SELECT tests.clear_authentication();

SELECT * FROM finish(); -- noqa: AM04

ROLLBACK;
