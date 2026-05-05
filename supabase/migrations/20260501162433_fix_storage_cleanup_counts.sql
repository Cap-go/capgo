-- Keep deleted bundle metadata out of the admin storage trend.
-- Physical R2 cleanup is asynchronous, but this metric is used for active bundle storage.
CREATE OR REPLACE FUNCTION "public"."total_bundle_storage_bytes"() RETURNS bigint
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT (
    -- Sum bundle sizes only for active app versions.
    COALESCE(
      (
        SELECT SUM(avm.size)
        FROM public.app_versions_meta avm
        INNER JOIN public.app_versions av ON av.id = avm.id
        WHERE av.deleted = false
      ),
      0
    ) +
    -- Sum manifest file sizes only for active app versions.
    COALESCE(
      (
        SELECT SUM(m.file_size)
        FROM public.manifest m
        WHERE EXISTS (
          SELECT 1
          FROM public.app_versions av
          WHERE av.id = m.app_version_id
            AND av.deleted = false
        )
      ),
      0
    )
  )::bigint;
$$;

ALTER FUNCTION "public"."total_bundle_storage_bytes"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."total_bundle_storage_bytes"() IS 'Returns active bundle storage in bytes including bundle sizes (app_versions_meta.size) and manifest file sizes for non-deleted app versions.';

REVOKE ALL ON FUNCTION "public"."total_bundle_storage_bytes"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."total_bundle_storage_bytes"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."total_bundle_storage_bytes"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."total_bundle_storage_bytes"() FROM "service_role";
GRANT EXECUTE ON FUNCTION "public"."total_bundle_storage_bytes"() TO "service_role";

-- The high-frequency queue previously used the default 950-message batch for every
-- queue, which can fan out hundreds of S3 deletes at once during retention cleanup.
UPDATE public.cron_tasks
SET
  batch_size = 100,
  updated_at = now()
WHERE name = 'high_frequency_queues'
  AND (batch_size IS NULL OR batch_size > 100);
