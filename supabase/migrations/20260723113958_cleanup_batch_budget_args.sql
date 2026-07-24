-- Allow small per-call budgets so SQL Editor / short timeouts can reclaim
-- iteratively: SELECT public.cleanup_queue_messages(1, 500); (re-run until notice 0)

DROP FUNCTION IF EXISTS "public"."cleanup_queue_messages"();
CREATE OR REPLACE FUNCTION "public"."cleanup_queue_messages"(
  "max_batches_total" integer DEFAULT 40,
  "batch_size" integer DEFAULT 10000
) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  queue_name text;
  cutoff timestamptz := pg_catalog.now() - INTERVAL '2 days';
  batches_used integer := 0;
  deleted_batch integer;
  deleted_archived_total bigint := 0;
  deleted_stuck_total bigint := 0;
  did_work boolean;
  archive_rel regclass;
  queue_rel regclass;
  v_max_batches integer := GREATEST(1, COALESCE(max_batches_total, 40));
  v_batch_size integer := GREATEST(1, COALESCE(batch_size, 10000));
BEGIN
  LOOP
    EXIT WHEN batches_used >= v_max_batches;
    did_work := false;

    FOR queue_name IN (
      SELECT q.queue_name FROM pgmq.list_queues() q
    ) LOOP
      EXIT WHEN batches_used >= v_max_batches;

      archive_rel := to_regclass(pg_catalog.format('pgmq.a_%I', queue_name));
      queue_rel := to_regclass(pg_catalog.format('pgmq.q_%I', queue_name));

      IF archive_rel IS NOT NULL THEN
        EXECUTE pg_catalog.format(
          'DELETE FROM pgmq.a_%I
           WHERE ctid IN (
             SELECT ctid
             FROM pgmq.a_%I
             WHERE archived_at < $1
             LIMIT $2
           )',
          queue_name,
          queue_name
        )
        USING cutoff, v_batch_size;

        GET DIAGNOSTICS deleted_batch = ROW_COUNT;
        IF deleted_batch > 0 THEN
          batches_used := batches_used + 1;
          deleted_archived_total := deleted_archived_total + deleted_batch;
          did_work := true;
        END IF;
      END IF;

      IF batches_used >= v_max_batches THEN
        EXIT;
      END IF;

      IF queue_rel IS NOT NULL THEN
        EXECUTE pg_catalog.format(
          'DELETE FROM pgmq.q_%I
           WHERE ctid IN (
             SELECT ctid
             FROM pgmq.q_%I
             WHERE read_ct > 5
             LIMIT $1
           )',
          queue_name,
          queue_name
        )
        USING v_batch_size;

        GET DIAGNOSTICS deleted_batch = ROW_COUNT;
        IF deleted_batch > 0 THEN
          batches_used := batches_used + 1;
          deleted_stuck_total := deleted_stuck_total + deleted_batch;
          did_work := true;
        END IF;
      END IF;
    END LOOP;

    EXIT WHEN NOT did_work;
  END LOOP;

  RAISE NOTICE
    'cleanup_queue_messages: archived_deleted=% stuck_deleted=% batches_used=%/% batch_size=%',
    deleted_archived_total,
    deleted_stuck_total,
    batches_used,
    v_max_batches,
    v_batch_size;
END;
$$;

ALTER FUNCTION "public"."cleanup_queue_messages"(integer, integer) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."cleanup_queue_messages"(integer, integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_queue_messages"(integer, integer) TO "service_role";

DROP FUNCTION IF EXISTS "public"."cleanup_old_audit_logs"();
CREATE OR REPLACE FUNCTION "public"."cleanup_old_audit_logs"(
  "max_batches" integer DEFAULT 40,
  "batch_size" integer DEFAULT 5000
) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  cutoff timestamptz := pg_catalog.now() - INTERVAL '30 days';
  batch_no integer := 0;
  deleted_batch integer;
  deleted_total bigint := 0;
  v_max_batches integer := GREATEST(1, COALESCE(max_batches, 40));
  v_batch_size integer := GREATEST(1, COALESCE(batch_size, 5000));
BEGIN
  LOOP
    batch_no := batch_no + 1;
    EXIT WHEN batch_no > v_max_batches;

    DELETE FROM public.audit_logs
    WHERE ctid IN (
      SELECT ctid
      FROM public.audit_logs
      WHERE created_at < cutoff
      LIMIT v_batch_size
    );

    GET DIAGNOSTICS deleted_batch = ROW_COUNT;
    deleted_total := deleted_total + deleted_batch;
    EXIT WHEN deleted_batch = 0;
  END LOOP;

  RAISE NOTICE
    'cleanup_old_audit_logs: deleted=% batches=%/% batch_size=%',
    deleted_total,
    batch_no,
    v_max_batches,
    v_batch_size;
END;
$$;

ALTER FUNCTION "public"."cleanup_old_audit_logs"(integer, integer) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."cleanup_old_audit_logs"(integer, integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_old_audit_logs"(integer, integer) TO "service_role";

DROP FUNCTION IF EXISTS "public"."null_migrated_app_version_manifests"();
CREATE OR REPLACE FUNCTION "public"."null_migrated_app_version_manifests"(
  "max_batches" integer DEFAULT 50,
  "batch_size" integer DEFAULT 200
) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  batch_no integer := 0;
  updated_batch integer;
  updated_total bigint := 0;
  v_max_batches integer := GREATEST(1, COALESCE(max_batches, 50));
  v_batch_size integer := GREATEST(1, COALESCE(batch_size, 200));
BEGIN
  LOOP
    batch_no := batch_no + 1;
    EXIT WHEN batch_no > v_max_batches;

    WITH doomed AS (
      SELECT av.id
      FROM public.app_versions AS av
      WHERE av.manifest IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.unnest(av.manifest) AS entry(file_name, s3_path, file_hash)
          WHERE NOT EXISTS (
            SELECT 1
            FROM public.manifest AS m
            WHERE m.app_version_id = av.id
              AND m.s3_path = entry.s3_path
              AND m.file_hash = entry.file_hash
          )
        )
      ORDER BY av.id
      LIMIT v_batch_size
    )
    UPDATE public.app_versions AS av
    SET manifest = NULL
    FROM doomed
    WHERE av.id = doomed.id;

    GET DIAGNOSTICS updated_batch = ROW_COUNT;
    updated_total := updated_total + updated_batch;
    EXIT WHEN updated_batch = 0;
  END LOOP;

  RAISE NOTICE
    'null_migrated_app_version_manifests: updated=% batches=%/% batch_size=%',
    updated_total,
    batch_no,
    v_max_batches,
    v_batch_size;
END;
$$;

ALTER FUNCTION "public"."null_migrated_app_version_manifests"(integer, integer) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."null_migrated_app_version_manifests"(integer, integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."null_migrated_app_version_manifests"(integer, integer) TO "service_role";
