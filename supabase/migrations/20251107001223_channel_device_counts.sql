-- Add a running count of channel devices per app
ALTER TABLE public.apps
ADD COLUMN channel_device_count bigint NOT NULL DEFAULT 0;

-- Backfill the counter based on current channel_devices data
WITH device_counts AS (
    SELECT
        app_id,
        COUNT(*)::bigint AS device_count
    FROM public.channel_devices
    GROUP BY app_id
)

UPDATE public.apps AS a
SET channel_device_count = dc.device_count
FROM device_counts AS dc
WHERE dc.app_id = a.app_id;

-- Create dedicated queue for channel device count deltas
SELECT pgmq.create('channel_device_counts');

-- Trigger helper to enqueue +/-1 events when channel_devices changes
CREATE OR REPLACE FUNCTION public.enqueue_channel_device_counts() RETURNS trigger
LANGUAGE plpgsql
SET search_path = '' SECURITY DEFINER AS $$
DECLARE
  v_delta integer;
  v_app_id text;
  v_owner uuid;
  v_device text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_delta := 1;
    v_app_id := NEW.app_id;
    v_owner := NEW.owner_org;
    v_device := NEW.device_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_delta := -1;
    v_app_id := OLD.app_id;
    v_owner := OLD.owner_org;
    v_device := OLD.device_id;
  ELSE
    RETURN NEW;
  END IF;

  PERFORM pgmq.send(
    'channel_device_counts',
    jsonb_build_object(
      'app_id', v_app_id,
      'owner_org', v_owner,
      'device_id', v_device,
      'delta', v_delta
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION public.enqueue_channel_device_counts() OWNER TO postgres;

-- Ensure trigger exists exactly once
DROP TRIGGER IF EXISTS channel_device_count_enqueue ON public.channel_devices;

CREATE TRIGGER channel_device_count_enqueue
AFTER INSERT OR DELETE ON public.channel_devices
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_channel_device_counts();

-- Worker that drains the queue and updates app counters
CREATE OR REPLACE FUNCTION public.process_channel_device_counts_queue(
    batch_size integer DEFAULT 1000
) RETURNS bigint
LANGUAGE plpgsql
SET search_path = '' SECURITY DEFINER AS $$
DECLARE
  message_record RECORD;
  v_payload jsonb;
  v_app_id text;
  v_delta integer;
  msg_ids bigint[] := ARRAY[]::bigint[];
  processed bigint := 0;
BEGIN
  IF batch_size IS NULL OR batch_size < 1 THEN
    batch_size := 100;
  END IF;

  FOR message_record IN
    SELECT *
    FROM pgmq.read('channel_device_counts', 60, batch_size)
  LOOP
    v_payload := message_record.message;
    v_app_id := v_payload ->> 'app_id';
    v_delta := COALESCE((v_payload ->> 'delta')::integer, 0);

    IF v_app_id IS NULL OR v_delta = 0 THEN
      msg_ids := array_append(msg_ids, message_record.msg_id);
      CONTINUE;
    END IF;

    UPDATE public.apps
    SET channel_device_count = GREATEST(channel_device_count + v_delta, 0),
        updated_at = NOW()
    WHERE app_id = v_app_id;

    processed := processed + 1;
    msg_ids := array_append(msg_ids, message_record.msg_id);
  END LOOP;

  IF array_length(msg_ids, 1) IS NOT NULL THEN
    PERFORM pgmq.delete('channel_device_counts', msg_ids);
  END IF;

  RETURN processed;
END;
$$;

ALTER FUNCTION public.process_channel_device_counts_queue(
    batch_size integer
) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.process_channel_device_counts_queue(
    batch_size integer
) TO service_role;

-- Schedule continuous processing of the new queue
SELECT
    cron.schedule(
        'process_channel_device_counts_queue',
        '10 seconds',
        'SELECT public.process_channel_device_counts_queue(1000);'
    );
