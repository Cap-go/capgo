-- Keep the existing bounded sweeper/queue contract, including recovery recorded
-- by old deployments. Counter finalization belongs to the handler transaction.
-- Failed restores rotate behind unattempted paths, so a bounded drain cannot
-- strand later recoverable objects behind a full batch of persistent failures.
ALTER TABLE public.manifest_trash_restore_pending ADD COLUMN last_attempted_at timestamptz;
CREATE INDEX manifest_trash_restore_pending_retry_idx
  ON public.manifest_trash_restore_pending (app_version_id, last_attempted_at ASC NULLS FIRST, s3_path);

CREATE OR REPLACE FUNCTION public.sweep_deleted_version_manifests(p_batch_size integer DEFAULT 100)
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
  -- Pending-only versions must be revisited even after counters reach zero.
  WITH candidates AS MATERIALIZED (
    SELECT av.id
    FROM public.app_versions AS av
    WHERE av.deleted = true
      AND (
        av.manifest_count > 0 OR av.manifest IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.manifest AS m WHERE m.app_version_id = av.id)
        OR EXISTS (SELECT 1 FROM public.manifest_trash_restore_pending AS p WHERE p.app_version_id = av.id)
      )
    ORDER BY av.deleted_at NULLS LAST, av.id
    LIMIT p_batch_size
  )
  UPDATE public.app_versions AS av
  SET updated_at = now()
  WHERE av.id = ANY(ARRAY(SELECT id FROM candidates));

  GET DIAGNOSTICS requeued = ROW_COUNT;
  RETURN requeued;
END;
$$;
ALTER FUNCTION public.sweep_deleted_version_manifests(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sweep_deleted_version_manifests(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sweep_deleted_version_manifests(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_deleted_version_manifests(integer) TO service_role;
COMMENT ON FUNCTION public.sweep_deleted_version_manifests(integer) IS
  'Bounded requeue of deleted versions with manifest rows, legacy manifests, stale counters or pending trash recovery. Handler removes database references and finalizes counters; delta objects remain in R2.';
