-- Create the manifest table with file size support
CREATE TABLE IF NOT EXISTS "public"."manifest" (
    "id" SERIAL PRIMARY KEY,
    "app_version_id" BIGINT NOT NULL REFERENCES "public"."app_versions"("id") ON DELETE CASCADE,
    -- "app_id" VARCHAR NOT NULL REFERENCES "public"."apps"("app_id") ON DELETE CASCADE,
    "file_name" VARCHAR NOT NULL,
    "s3_path" VARCHAR NOT NULL,
    "file_hash" VARCHAR NOT NULL,
    "file_size" BIGINT DEFAULT 0
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "idx_manifest_app_version_id" ON "public"."manifest" ("app_version_id");

-- Migrate existing data from app_versions.manifest to the new manifest table
BEGIN;

INSERT INTO "public"."manifest" ("app_version_id", "file_name", "s3_path", "file_hash")
SELECT 
    av.id as app_version_id,
    (m).file_name as file_name,
    (m).s3_path as s3_path,
    (m).file_hash as file_hash
FROM 
    "public"."app_versions" av,
    UNNEST(av.manifest) m
WHERE 
    av.manifest IS NOT NULL AND array_length(av.manifest, 1) > 0;

UPDATE "public"."app_versions"
SET manifest = NULL
WHERE manifest IS NOT NULL AND array_length(manifest, 1) > 0;

COMMIT;

-- Add trigger for the manifest table to replicate data to D1
CREATE TRIGGER replicate_manifest
    AFTER INSERT OR DELETE ON public.manifest
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function_d1();

-- Enable Row Level Security
ALTER TABLE "public"."manifest" ENABLE ROW LEVEL SECURITY;

-- Create policy for reading manifest entries
-- Users can read any manifest entry
CREATE POLICY "Allow users to read any manifest entry" 
ON "public"."manifest" 
FOR SELECT 
TO authenticated 
USING (true);

-- Create policy for inserting manifest entries
-- Users can insert manifest entries for app versions they have access to
CREATE POLICY "Allow users to insert manifest entries" 
ON "public"."manifest" 
FOR INSERT 
TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "public"."app_versions" av
    JOIN "public"."apps" a ON av.app_id = a.app_id
    WHERE 
      av.id = app_version_id AND
      a.owner_org IN (
        SELECT id FROM "public"."orgs" o
        WHERE o.id IN (
          SELECT org_id FROM "public"."org_users" ou
          WHERE ou.user_id = auth.uid()
        )
      )
  )
);

-- Create policy for updating manifest entries
-- Users cannot update manifest entries (create only)
CREATE POLICY "Prevent users from updating manifest entries" 
ON "public"."manifest" 
FOR UPDATE 
TO authenticated 
USING (false);

-- Create policy for deleting manifest entries
-- Users can only delete manifest entries for app versions they have access to
CREATE POLICY "Allow users to delete manifest entries" 
ON "public"."manifest" 
FOR DELETE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM "public"."app_versions" av
    JOIN "public"."apps" a ON av.app_id = a.app_id
    WHERE 
      av.id = app_version_id AND
      a.owner_org IN (
        SELECT id FROM "public"."orgs" o
        WHERE o.id IN (
          SELECT org_id FROM "public"."org_users" ou
          WHERE ou.user_id = auth.uid()
        )
      )
  )
);

SELECT pgmq.create('on_manifest_create');

SELECT cron.schedule(
    'process_manifest_create_queue',
    '5 seconds',
    $$SELECT process_function_queue('on_manifest_create');$$
);

CREATE OR REPLACE TRIGGER "on_manifest_create" AFTER INSERT ON "public"."manifest" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_manifest_create');
