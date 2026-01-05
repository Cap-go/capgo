-- Track manifest-capable bundles per app

ALTER TABLE public.apps
ADD COLUMN manifest_bundle_count bigint NOT NULL DEFAULT 0;

-- Backfill based on existing manifest data
WITH manifest_counts AS (
    SELECT
        av.app_id,
        COUNT(DISTINCT av.id)::bigint AS bundle_count
    FROM public.app_versions AS av
    WHERE
        EXISTS (
            SELECT 1
            FROM public.manifest AS m
            WHERE m.app_version_id = av.id
        )
    GROUP BY av.app_id
)

UPDATE public.apps AS a
SET manifest_bundle_count = mc.bundle_count
FROM manifest_counts AS mc
WHERE mc.app_id = a.app_id;

-- Dedicated queue for manifest bundle deltas
SELECT pgmq.create('manifest_bundle_counts');

CREATE OR REPLACE FUNCTION public.enqueue_manifest_bundle_counts() RETURNS trigger
LANGUAGE plpgsql
SET search_path = '' SECURITY DEFINER AS $$
DECLARE
  v_delta integer := 0;
  v_app_id text;
  v_owner uuid;
  v_app_version_id bigint;
  v_has_other boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_app_version_id := NEW.app_version_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_app_version_id := OLD.app_version_id;
  ELSE
    RETURN NEW;
  END IF;

  SELECT av.app_id, av.owner_org
  INTO v_app_id, v_owner
  FROM public.app_versions av
  WHERE av.id = v_app_version_id
  LIMIT 1;

  IF v_app_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.manifest
      WHERE app_version_id = v_app_version_id
        AND id <> NEW.id
    )
    INTO v_has_other;

    IF NOT v_has_other THEN
      v_delta := 1;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.manifest
      WHERE app_version_id = v_app_version_id
        AND id <> OLD.id
    )
    INTO v_has_other;

    IF NOT v_has_other THEN
      v_delta := -1;
    END IF;
  END IF;

  IF v_delta = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM pgmq.send(
    'manifest_bundle_counts',
    jsonb_build_object(
      'app_id', v_app_id,
      'owner_org', v_owner,
      'app_version_id', v_app_version_id,
      'delta', v_delta
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION public.enqueue_manifest_bundle_counts() OWNER TO postgres;

DROP TRIGGER IF EXISTS manifest_bundle_count_enqueue ON public.manifest;

CREATE TRIGGER manifest_bundle_count_enqueue
AFTER INSERT OR DELETE ON public.manifest
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_manifest_bundle_counts();

CREATE OR REPLACE FUNCTION public.process_manifest_bundle_counts_queue(
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
    FROM pgmq.read('manifest_bundle_counts', 60, batch_size)
  LOOP
    v_payload := message_record.message;
    v_app_id := v_payload ->> 'app_id';
    v_delta := COALESCE((v_payload ->> 'delta')::integer, 0);

    IF v_app_id IS NULL OR v_delta = 0 THEN
      msg_ids := array_append(msg_ids, message_record.msg_id);
      CONTINUE;
    END IF;

    UPDATE public.apps
    SET manifest_bundle_count = GREATEST(manifest_bundle_count + v_delta, 0),
        updated_at = NOW()
    WHERE app_id = v_app_id;

    processed := processed + 1;
    msg_ids := array_append(msg_ids, message_record.msg_id);
  END LOOP;

  IF array_length(msg_ids, 1) IS NOT NULL THEN
    PERFORM pgmq.delete('manifest_bundle_counts', msg_ids);
  END IF;

  RETURN processed;
END;
$$;

ALTER FUNCTION public.process_manifest_bundle_counts_queue(
    batch_size integer
) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.process_manifest_bundle_counts_queue(
    batch_size integer
) TO service_role;

SELECT
    cron.schedule(
        'process_manifest_bundle_counts_queue',
        '20 seconds',
        'SELECT public.process_manifest_bundle_counts_queue(1000);'
    );
