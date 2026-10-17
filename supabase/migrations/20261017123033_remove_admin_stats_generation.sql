-- Capgo no longer generates admin statistics. The admin dashboard
-- (Cap-go/capgo_admin_dashboard) reads Capgo Postgres read-only and builds its
-- own daily snapshots. Remove the generation crons, queues, triggers and
-- functions, then the admin-only tables. Their history was copied to the admin
-- dashboard's D1 database before this migration (verified day by day).
SET LOCAL lock_timeout = '2s';

-- Cron rows. Without them process_all_cron_tasks never touches the removed
-- functions or queues.
DELETE FROM public.cron_tasks
WHERE name IN (
    'admin_stats',
    'global_stats_creates',
    'cron_app_fame',
    'app_fame_queue'
);

UPDATE public.cron_tasks
SET
    target = (
        SELECT pg_catalog.jsonb_agg(queue_name ORDER BY ordinality)::text
        FROM pg_catalog.jsonb_array_elements_text(target::jsonb)
            WITH ORDINALITY AS queues (queue_name, ordinality)
        WHERE queue_name <> 'admin_stats'
    ),
    updated_at = pg_catalog.now()
WHERE
    name = 'low_frequency_queues'
    AND task_type = 'function_queue'
    AND target::jsonb ? 'admin_stats';

-- Event-sourced create counters on the apps / app_versions insert path.
DROP TRIGGER IF EXISTS global_stats_creates_on_app_insert ON public.apps;
DROP TRIGGER IF EXISTS global_stats_creates_on_version_insert
ON public.app_versions;
DROP FUNCTION IF EXISTS public.enqueue_global_stats_creates();
DROP FUNCTION IF EXISTS public.process_global_stats_creates_queue(integer);

DROP FUNCTION IF EXISTS public.process_admin_stats();

-- cron_app_fame no longer exists, so only the onboarding refresh queue keeps
-- the awaited single-call consumer.
CREATE OR REPLACE FUNCTION public.process_function_queue(
    "queue_name" text, "batch_size" integer DEFAULT 950
) RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  calls_needed int;
  headers jsonb;
  queue_size bigint;
  request_timeout_ms int;
  url text;
  onboarding_queue boolean := queue_name = 'cron_onboarding_refresh_apps';
  awaited_queue boolean := queue_name = 'cron_onboarding_refresh_apps';
BEGIN
  EXECUTE pg_catalog.format('SELECT count(*) FROM pgmq.%I', 'q_' || queue_name)
  INTO queue_size;

  IF queue_size > 0 THEN
    IF onboarding_queue THEN
      batch_size := LEAST(batch_size, 4);
    END IF;
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'apisecret', public.get_apikey()
    );
    request_timeout_ms := CASE
      WHEN awaited_queue THEN 100000
      WHEN queue_name = 'on_manifest_create' THEN 60000
      ELSE 8000
    END;
    url := public.get_db_url() || '/functions/v1/triggers/queue_consumer/sync';

    calls_needed := LEAST(
      pg_catalog.ceil(queue_size / batch_size::double precision)::int,
      10
    );

    IF awaited_queue THEN
      calls_needed := 1;
    END IF;

    FOR i IN 1..calls_needed LOOP
      PERFORM net.http_post(
        url := url,
        headers := headers,
        body := pg_catalog.jsonb_build_object(
          'queue_name', queue_name,
          'batch_size', batch_size,
          'wait_for_completion', awaited_queue
        ),
        timeout_milliseconds := request_timeout_ms
      );
    END LOOP;
  END IF;
END;
$$;

ALTER FUNCTION public.process_function_queue(text, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.process_function_queue(text, integer) FROM PUBLIC;

-- Pending messages only targeted the removed /triggers/global_stats* and
-- /triggers/cron_app_fame routes or the dropped create-counter processor.
-- Nothing else sends to these queues, so drop them instead of letting the
-- messages fail and pile up.
DO $$
DECLARE
  removed_queue text;
BEGIN
  FOREACH removed_queue IN ARRAY ARRAY[
    'admin_stats',
    'global_stats_creates',
    'cron_app_fame'
  ] LOOP
    IF EXISTS (
      SELECT 1
      FROM pgmq.list_queues()
      WHERE queue_name = removed_queue
    ) THEN
      PERFORM pgmq.drop_queue(removed_queue);
    END IF;
  END LOOP;
END;
$$;

-- Admin-only tables. Nothing else reads them; the functions that wrote them
-- are dropped above. app_fame's FK to apps goes with it.
DROP TABLE IF EXISTS public.global_stats;
DROP TABLE IF EXISTS public.app_fame;
