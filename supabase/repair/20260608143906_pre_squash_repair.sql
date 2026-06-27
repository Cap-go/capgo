-- Repair path for existing databases when adopting the 20260608143906 squashed
-- baseline. Apply this file only when that version is not already applied.
DO $$
BEGIN
  IF to_regclass('public.compatibility_events') IS NULL THEN
    RAISE EXCEPTION 'public.compatibility_events is missing; run the squashed baseline normally for fresh databases';
  END IF;

  ALTER TABLE public.compatibility_events
    ADD COLUMN IF NOT EXISTS change_occurred_at timestamptz;

  UPDATE public.compatibility_events
    SET change_occurred_at = created_at
    WHERE change_occurred_at IS NULL;

  ALTER TABLE public.compatibility_events
    ALTER COLUMN change_occurred_at SET NOT NULL;

  ALTER TABLE public.compatibility_events
    ALTER COLUMN change_occurred_at SET DEFAULT now();

  DROP INDEX IF EXISTS public.uq_compatibility_events_dedup;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_compatibility_events_dedup
    ON public.compatibility_events (app_id, channel_id, platform, current_version_id, previous_version_id, change_occurred_at)
    NULLS NOT DISTINCT;

  DROP POLICY IF EXISTS "Prevent users from updating manifest entries" ON public.manifest;

  CREATE POLICY "Prevent users from updating manifest entries"
    ON public.manifest
    AS RESTRICTIVE
    FOR UPDATE
    TO authenticated, anon
    USING (false)
    WITH CHECK (false);
END $$;
