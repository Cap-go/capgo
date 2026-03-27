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
            SELECT
                COALESCE(
                    jsonb_agg(value ORDER BY value),
                    '["webhook_delivery","webhook_dispatcher"]'::jsonb
                )::text
            FROM (
                SELECT jsonb_array_elements_text(ct.target::jsonb) AS value
                UNION
                SELECT 'webhook_dispatcher'
                UNION
                SELECT 'webhook_delivery'
            ) AS items
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
