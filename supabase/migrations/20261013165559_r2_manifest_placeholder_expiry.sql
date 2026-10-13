-- Internal, bounded placeholder maintenance. No R2 operation or tombstone purge.
-- Apply this helper separately to PlanetScale; Supabase history is not deployment.
CREATE FUNCTION public.expire_r2_manifest_placeholders(p_bucket text, p_limit integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
SET lock_timeout = '1s'
AS $$
DECLARE
    removed integer;
BEGIN
    IF p_bucket IS NULL OR pg_catalog.octet_length(p_bucket) NOT BETWEEN 1 AND 256
       OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION 'Invalid placeholder expiry bound' USING ERRCODE = '22023';
    END IF;
    -- A missing/unfinished separately deployed index must never turn maintenance
    -- into a sequential scan over the production inventory.
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_index AS idx
        WHERE idx.indexrelid = pg_catalog.to_regclass('public.r2_objects_expired_manifest_leases_idx')
          AND idx.indrelid = 'public.r2_objects'::pg_catalog.regclass
          AND idx.indisvalid AND idx.indisready
    ) THEN
        RAISE EXCEPTION 'Placeholder expiry index is missing or not ready';
    END IF;
    -- Consumer holds FOR SHARE across INSERT and SELECT. This exclusive lock
    -- prevents expiry from removing a placeholder in that gap. Repairs use CAS
    -- revisions and retry a missing/reinserted row rather than acknowledging it.
    PERFORM 1 FROM public.r2_inventory_checkpoints
    WHERE bucket_name = p_bucket AND job_name = 'admission' AND partition_key = ''
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    WITH candidates AS MATERIALIZED (
        SELECT bucket_name, r2_key FROM public.r2_objects
        WHERE bucket_name = p_bucket
          AND r2_state = 'to_be_uploaded'::public.r2_object_state
          AND manifest_lease_expires_at IS NOT NULL
          AND manifest_lease_expires_at <= pg_catalog.now()
        ORDER BY manifest_lease_expires_at, r2_key
        LIMIT p_limit FOR UPDATE SKIP LOCKED
    ), deleted AS (
        DELETE FROM public.r2_objects AS target USING candidates
        WHERE target.bucket_name = candidates.bucket_name AND target.r2_key = candidates.r2_key
          AND target.r2_state = 'to_be_uploaded'::public.r2_object_state
          AND target.manifest_lease_expires_at IS NOT NULL
          AND target.manifest_lease_expires_at <= pg_catalog.now()
        RETURNING 1
    ) SELECT pg_catalog.count(*)::integer INTO removed FROM deleted;
    RETURN removed;
END;
$$;
ALTER FUNCTION public.expire_r2_manifest_placeholders(text, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.expire_r2_manifest_placeholders(text, integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_r2_manifest_placeholders(text, integer) TO service_role;
COMMENT ON FUNCTION public.expire_r2_manifest_placeholders(text, integer) IS
'Internal expiry: bounded indexed placeholder deletion under the admission lock. No R2 deletion.';
