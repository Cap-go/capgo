-- Remove stale D1/device replication wiring that points at the obsolete
-- replicate_data queue. Current migrations never create this trigger, but it
-- still exists in production from the old replication system.
DROP TRIGGER IF EXISTS replicate_devices ON public.devices;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pgmq.list_queues()
    WHERE queue_name = 'replicate_data'
  ) THEN
    PERFORM pgmq.drop_queue('replicate_data');
  END IF;
END $$;
