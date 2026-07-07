-- Transactional outbox feeding the Cloudflare-embedded read replica
-- (per-app Durable Objects, see cloudflare_workers/replicator).
-- Every committed write on a replicated table appends one row here. A single
-- consumer (the ReplicaRouter Durable Object) drains it with
-- DELETE ... FOR UPDATE SKIP LOCKED and fans it out to the per-app replica
-- DOs, so rows from still-open transactions are never skipped and delivery
-- is exactly-once into the router journal.
-- Load on the main database is limited to these tiny appends plus one indexed
-- poll query every few seconds; device read traffic never touches it.
--
-- app_id / owner_org are the routing keys: app-scoped rows go to that app's
-- replicas, org-scoped rows (orgs, stripe_info) to every replica of the org.

CREATE TABLE public.replicate_outbox (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    table_name text NOT NULL,
    op text NOT NULL CHECK (op IN ('INSERT', 'UPDATE', 'DELETE')),
    app_id character varying,
    owner_org uuid,
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
DECLARE
  rec record;
  v_row jsonb;
  v_app_id character varying;
  v_owner_org uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rec := OLD;
  ELSE
    rec := NEW;
  END IF;
  v_row := to_jsonb(rec);

  -- Routing keys per table. manifest has no app_id column, resolve it via
  -- its bundle (indexed primary-key lookup).
  IF TG_TABLE_NAME = 'orgs' THEN
    v_owner_org := (v_row ->> 'id')::uuid;
  ELSIF TG_TABLE_NAME = 'stripe_info' THEN
    SELECT o.id INTO v_owner_org
    FROM public.orgs o
    WHERE o.customer_id = v_row ->> 'customer_id';
  ELSIF TG_TABLE_NAME = 'manifest' THEN
    SELECT av.app_id, av.owner_org INTO v_app_id, v_owner_org
    FROM public.app_versions av
    WHERE av.id = (v_row ->> 'app_version_id')::bigint;
  ELSE
    v_app_id := v_row ->> 'app_id';
    v_owner_org := (v_row ->> 'owner_org')::uuid;
  END IF;

  INSERT INTO public.replicate_outbox (table_name, op, app_id, owner_org, row_data)
  VALUES (TG_TABLE_NAME, TG_OP, v_app_id, v_owner_org, v_row);

  RETURN rec;
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

-- Safety purge: the router consumes-and-deletes, so this only matters if it
-- stays down for days. Past this window replicas reseed anyway.
SELECT cron.schedule(
  'purge_replicate_outbox',
  '17 * * * *',
  $$DELETE FROM public.replicate_outbox WHERE created_at < now() - interval '7 days'$$
);
