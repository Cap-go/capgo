-- A genuine re-occurrence of a previously-recorded (and possibly resolved)
-- transition must create a NEW row instead of being absorbed by the dedup
-- upsert. The occurrence identity is the channel row's updated_at at the time
-- of the change: a queue redelivery of the same webhook carries the same value
-- (still idempotent, resolution still protected), while a new flip of the same
-- bundle pair carries a new one and inserts a fresh, unresolved row.

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
