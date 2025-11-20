-- Simplify manifest bundle counts
-- Remove complex queue-based system and track manifest file count per version
-- The manifest_bundle_count in apps table will be updated directly by on_version_update

-- Add manifest_count to track number of manifest files per version
ALTER TABLE public.app_versions
ADD COLUMN manifest_count integer NOT NULL DEFAULT 0;

-- Backfill manifest_count for existing versions
UPDATE public.app_versions av
SET manifest_count = (
  SELECT COUNT(*)::integer
  FROM public.manifest m
  WHERE m.app_version_id = av.id
);

-- Drop the old complex trigger and function
DROP TRIGGER IF EXISTS manifest_bundle_count_enqueue ON public.manifest;
DROP FUNCTION IF EXISTS public.enqueue_manifest_bundle_counts();
DROP FUNCTION IF EXISTS public.process_manifest_bundle_counts_queue(integer);

-- Drop the queue (note: no schedule to drop as it was already removed in another migration)
SELECT pgmq.drop_queue('manifest_bundle_counts');
