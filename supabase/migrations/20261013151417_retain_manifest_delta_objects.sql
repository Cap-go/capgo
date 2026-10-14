-- Manifest cleanup only deletes database references. Retire all trash recovery.
-- Supabase migrations are transactional: large deployments must prebuild the
-- retry index concurrently using scripts/ops/deleted_manifest_retry_index.sql.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '5s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_index
    WHERE indexrelid = pg_catalog.to_regclass(
      'public.idx_app_versions_deleted_manifest_retry')
      AND indisvalid AND indisready
  ) THEN
    RETURN;
  END IF;
  IF pg_catalog.to_regclass(
    'public.idx_app_versions_deleted_manifest_retry') IS NOT NULL
  THEN
    RAISE EXCEPTION 'Repair the invalid deleted manifest retry index first';
  END IF;
  -- Bound the size check itself; do not rely on potentially stale estimates.
  IF (SELECT pg_catalog.count(*) FROM (
    SELECT 1 FROM public.app_versions LIMIT 10001
  ) AS bounded) > 10000 THEN
    RAISE EXCEPTION
      'Prebuild the index: scripts/ops/deleted_manifest_retry_index.sql';
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_app_versions_deleted_manifest_retry
ON public.app_versions (updated_at ASC NULLS FIRST, id) WHERE deleted = true;

CREATE OR REPLACE FUNCTION public.sweep_deleted_version_manifests(
    p_batch_size integer DEFAULT 100
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requeued bigint := 0;
BEGIN
  IF p_batch_size IS NULL OR p_batch_size < 1 THEN
    p_batch_size := 100;
  END IF;

  -- Preserve the deleted-version indexed key path and bounded manifest probes.
  WITH candidates AS MATERIALIZED (
    SELECT av.id
    FROM public.app_versions AS av
    WHERE av.deleted = true
      AND (
        av.manifest_count > 0 OR av.manifest IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.manifest AS m WHERE m.app_version_id = av.id)
      )
    ORDER BY av.updated_at ASC NULLS FIRST, av.id
    LIMIT p_batch_size
  )
  UPDATE public.app_versions AS av
  SET updated_at = pg_catalog.now()
  WHERE av.id = ANY(ARRAY(SELECT id FROM candidates));

  GET DIAGNOSTICS requeued = ROW_COUNT;
  RETURN requeued;
END;
$$;
ALTER FUNCTION public.sweep_deleted_version_manifests(
    integer
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sweep_deleted_version_manifests(
    integer
) FROM public;
REVOKE ALL ON FUNCTION public.sweep_deleted_version_manifests(
    integer
) FROM anon,
authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_deleted_version_manifests(
    integer
) TO service_role;
COMMENT ON FUNCTION public.sweep_deleted_version_manifests(integer) IS
'Requeue bounded database-only cleanup; delta objects stay in R2.';

DROP TABLE IF EXISTS public.manifest_trash_restore_pending;
