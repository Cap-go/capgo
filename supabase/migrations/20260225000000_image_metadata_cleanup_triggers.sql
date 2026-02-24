-- Add queue-backed image metadata cleanup triggers for user-uploaded images.

-- Create queues used by the backend trigger worker.
SELECT
  pgmq.create ('on_app_update');

SELECT
  pgmq.create ('on_org_update');

-- Run image metadata cleanup on app icon updates.
DROP TRIGGER IF EXISTS "on_app_update" ON "public"."apps";
CREATE TRIGGER "on_app_update"
AFTER
UPDATE OF "icon_url" ON "public"."apps" FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function" ('on_app_update');

-- Run image metadata cleanup on org logo updates.
DROP TRIGGER IF EXISTS "on_org_update" ON "public"."orgs";
CREATE TRIGGER "on_org_update"
AFTER
UPDATE OF "logo" ON "public"."orgs" FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function" ('on_org_update');

-- Keep high-frequency queue processing up-to-date with new image cleanup triggers.
WITH updated_target AS (
  SELECT
    ct.name,
    (
      SELECT COALESCE(jsonb_agg(value ORDER BY value), '["on_app_update","on_org_update"]'::jsonb)::text
      FROM (
        SELECT jsonb_array_elements_text(ct.target::jsonb) AS value
        UNION
        SELECT 'on_app_update'
        UNION
        SELECT 'on_org_update'
      ) AS items
    ) AS normalized_target
  FROM public.cron_tasks ct
  WHERE ct.name = 'high_frequency_queues'
)
UPDATE public.cron_tasks ct
SET target = updated_target.normalized_target
FROM updated_target
WHERE ct.name = updated_target.name;
