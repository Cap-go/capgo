SELECT pgmq.create('credit_usage_posthog');

CREATE TABLE IF NOT EXISTS public.backfill_progress (
  job_name text NOT NULL,
  scope_key text NOT NULL,
  cutover_at timestamp with time zone NOT NULL,
  last_processed_occurred_at timestamp with time zone,
  last_processed_id bigint,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (job_name, scope_key)
);

ALTER TABLE public.backfill_progress OWNER TO postgres;
ALTER TABLE public.backfill_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all access" ON public.backfill_progress;

CREATE POLICY "Deny all access" ON public.backfill_progress
USING (false)
WITH CHECK (false);

REVOKE ALL ON TABLE public.backfill_progress FROM PUBLIC;
REVOKE ALL ON TABLE public.backfill_progress FROM anon;
REVOKE ALL ON TABLE public.backfill_progress FROM authenticated;
GRANT ALL ON TABLE public.backfill_progress TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_credit_usage_posthog_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  BEGIN
    PERFORM pgmq.send(
      'credit_usage_posthog',
      jsonb_build_object(
        'function_name', 'credit_usage_posthog',
        'function_type', NULL,
        'payload', jsonb_build_object(
          'transaction_id', NEW.id,
          'org_id', NEW.org_id,
          'transaction_type', NEW.transaction_type,
          'occurred_at', NEW.occurred_at
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to enqueue credit usage PostHog event for transaction %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enqueue_credit_usage_posthog_event() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.enqueue_credit_usage_posthog_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_credit_usage_posthog_event() FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_credit_usage_posthog_event() FROM authenticated;
REVOKE ALL ON FUNCTION public.enqueue_credit_usage_posthog_event() FROM service_role;

DROP TRIGGER IF EXISTS credit_usage_posthog_on_transactions ON public.usage_credit_transactions;

CREATE TRIGGER credit_usage_posthog_on_transactions
AFTER INSERT ON public.usage_credit_transactions
FOR EACH ROW EXECUTE FUNCTION public.enqueue_credit_usage_posthog_event();

UPDATE public.cron_tasks
SET target = CASE
  WHEN target::jsonb ? 'credit_usage_posthog' THEN target
  ELSE (target::jsonb || '["credit_usage_posthog"]'::jsonb)::text
END
WHERE name = 'high_frequency_queues'
  AND task_type = 'function_queue';
