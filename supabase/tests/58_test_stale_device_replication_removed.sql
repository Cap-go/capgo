BEGIN;

SELECT plan(3);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE
      NOT t.tgisinternal
      AND n.nspname = 'public'
      AND c.relname = 'devices'
      AND t.tgname = 'replicate_devices'
  ),
  'stale replicate_devices trigger is absent'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pgmq.list_queues()
    WHERE queue_name = 'replicate_data'
  ),
  'obsolete replicate_data queue is absent'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE
      NOT t.tgisinternal
      AND n.nspname = 'public'
      AND c.relname = 'apps'
      AND t.tgname = 'on_app_create'
      AND p.proname = 'trigger_http_queue_post_to_function'
  ),
  'active queue trigger system remains intact'
);

SELECT * FROM finish(); -- noqa: AM04

ROLLBACK;
