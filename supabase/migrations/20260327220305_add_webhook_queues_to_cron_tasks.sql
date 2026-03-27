-- Ensure webhook queues are drained by the table-driven cron scheduler.
--
-- Webhooks were originally added to the legacy hard-coded process_all_cron_tasks
-- implementation, but the later cron_tasks migration rebuilt the high-frequency
-- queue list without carrying webhook_dispatcher/webhook_delivery forward.
-- Update the active cron_tasks row in place so existing environments start
-- processing webhook queues again.

WITH updated_target AS (
    SELECT
        ct.name,
        (
            WITH current_target AS (
                SELECT COALESCE(ct.target::jsonb, '[]'::jsonb) AS target
            ),
            ordered_items AS (
                SELECT value, ordinality
                FROM current_target,
                    jsonb_array_elements_text(current_target.target) WITH ORDINALITY AS existing_items(value, ordinality)

                UNION ALL

                SELECT 'webhook_dispatcher', 1000000
                FROM current_target
                WHERE NOT current_target.target ? 'webhook_dispatcher'

                UNION ALL

                SELECT 'webhook_delivery', 1000001
                FROM current_target
                WHERE NOT current_target.target ? 'webhook_delivery'
            )
            SELECT
                COALESCE(
                    jsonb_agg(value ORDER BY ordinality),
                    '["webhook_dispatcher","webhook_delivery"]'::jsonb
                )::text
            FROM ordered_items
        ) AS normalized_target
    FROM public.cron_tasks AS ct
    WHERE ct.name = 'high_frequency_queues'
)
UPDATE public.cron_tasks AS ct
SET
    target = updated_target.normalized_target,
    updated_at = now()
FROM updated_target
WHERE ct.name = updated_target.name;
