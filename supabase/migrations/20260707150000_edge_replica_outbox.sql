-- Transactional outbox feeding the Cloudflare-embedded read replica (D1).
-- Every committed write on a replicated table appends one row here. A single
-- consumer (the capgo_replicator Durable Object) drains it with
-- DELETE ... FOR UPDATE SKIP LOCKED and applies the batch to D1, so rows from
-- still-open transactions are never skipped and delivery is exactly-once.
-- Load on the main database is limited to these tiny appends plus one indexed
-- poll query every few seconds; device read traffic never touches it.

CREATE TABLE public.replicate_outbox (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    table_name text NOT NULL,
    op text NOT NULL CHECK (op IN ('INSERT', 'UPDATE', 'DELETE')),
    row_data jsonb NOT NULL
);

ALTER TABLE public.replicate_outbox ENABLE ROW LEVEL SECURITY;

-- No policies on purpose: only service-role / direct connections may touch it.

CREATE INDEX replicate_outbox_created_at_idx ON public.replicate_outbox (created_at);

CREATE OR REPLACE FUNCTION public.replicate_outbox_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.replicate_outbox (table_name, op, row_data)
    VALUES (TG_TABLE_NAME, TG_OP, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  INSERT INTO public.replicate_outbox (table_name, op, row_data)
  VALUES (TG_TABLE_NAME, TG_OP, to_jsonb(NEW));
  RETURN NEW;
END;
$$;

-- Attach to every table mirrored into the edge replica
-- (keep in sync with EDGE_REPLICA_TABLES in
-- supabase/functions/_backend/utils/edge_replica_schema.ts).
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'apps',
    'app_versions',
    'channel_devices',
    'channels',
    'manifest',
    'notifications',
    'onboarding_demo_data',
    'org_users',
    'orgs',
    'stripe_info'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER replicate_outbox_capture_ins_del
         AFTER INSERT OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.replicate_outbox_capture()',
      tbl
    );
    -- Separate UPDATE trigger so no-op updates do not pollute the outbox.
    EXECUTE format(
      'CREATE TRIGGER replicate_outbox_capture_upd
         AFTER UPDATE ON public.%I
         FOR EACH ROW WHEN (OLD IS DISTINCT FROM NEW)
         EXECUTE FUNCTION public.replicate_outbox_capture()',
      tbl
    );
  END LOOP;
END;
$$;

-- Safety purge: the replicator consumes-and-deletes, so this only matters if
-- it stays down for days. Past this window a reseed is required anyway.
SELECT cron.schedule(
  'purge_replicate_outbox',
  '17 * * * *',
  $$DELETE FROM public.replicate_outbox WHERE created_at < now() - interval '7 days'$$
);
