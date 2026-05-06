-- Queue website message catalog translations so Workers AI work stays off the public request path.

CREATE TABLE IF NOT EXISTS "public"."translation_messages_cache" (
  "target_language" text NOT NULL,
  "checksum" text NOT NULL,
  "model" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "messages" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "next_batch_index" integer NOT NULL DEFAULT 0,
  "expires_at" timestamp with time zone NOT NULL DEFAULT now() + interval '5 minutes',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "translation_messages_cache_pkey" PRIMARY KEY ("target_language", "checksum"),
  CONSTRAINT "translation_messages_cache_status_check" CHECK ("status" IN ('pending', 'ready')),
  CONSTRAINT "translation_messages_cache_next_batch_index_check" CHECK ("next_batch_index" >= 0)
);

ALTER TABLE "public"."translation_messages_cache" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny select on translation_messages_cache" ON "public"."translation_messages_cache";
CREATE POLICY "Deny select on translation_messages_cache"
ON "public"."translation_messages_cache"
AS RESTRICTIVE
FOR SELECT
TO anon, authenticated
USING (false);

DROP POLICY IF EXISTS "Deny insert on translation_messages_cache" ON "public"."translation_messages_cache";
CREATE POLICY "Deny insert on translation_messages_cache"
ON "public"."translation_messages_cache"
AS RESTRICTIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS "Deny update on translation_messages_cache" ON "public"."translation_messages_cache";
CREATE POLICY "Deny update on translation_messages_cache"
ON "public"."translation_messages_cache"
AS RESTRICTIVE
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Deny delete on translation_messages_cache" ON "public"."translation_messages_cache";
CREATE POLICY "Deny delete on translation_messages_cache"
ON "public"."translation_messages_cache"
AS RESTRICTIVE
FOR DELETE
TO anon, authenticated
USING (false);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pgmq.list_queues() AS q
    WHERE q.queue_name = 'translation_messages'
  ) THEN
    PERFORM pgmq.create('translation_messages');
  END IF;
END $$;

-- Drain translation work with the existing high-frequency queue runner.
WITH updated_target AS (
  SELECT
    ct.name,
    (
      WITH current_target AS (
        SELECT COALESCE(ct.target::jsonb, '[]'::jsonb) AS target
      ),
      ordered_items AS (
        SELECT value, ordinality
        FROM current_target,
          jsonb_array_elements_text(current_target.target) WITH ORDINALITY AS existing_items(value, ordinality)

        UNION ALL

        SELECT 'translation_messages', 1000000
        FROM current_target
        WHERE NOT current_target.target ? 'translation_messages'
      )
      SELECT
        COALESCE(
          jsonb_agg(value ORDER BY ordinality),
          '["translation_messages"]'::jsonb
        )::text
      FROM ordered_items
    ) AS normalized_target
  FROM public.cron_tasks AS ct
  WHERE ct.name = 'high_frequency_queues'
)
UPDATE public.cron_tasks AS ct
SET
  target = updated_target.normalized_target,
  updated_at = now()
FROM updated_target
WHERE ct.name = updated_target.name;
