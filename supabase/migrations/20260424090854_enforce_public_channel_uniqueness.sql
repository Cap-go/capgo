-- Enforce one public channel winner per app/platform at write time.
-- This closes the race where overlapping public channels can coexist briefly
-- and unnamed /updates requests silently pick an implicit winner.

CREATE OR REPLACE FUNCTION public.normalize_public_channel_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Serialize public-channel changes per app so concurrent writers cannot
  -- reintroduce overlapping public state between the normalization update and
  -- the row write itself.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.app_id));

  IF NEW.public IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  UPDATE public.channels AS existing
  SET public = false
  WHERE existing.app_id = NEW.app_id
    AND existing.public = true
    AND existing.id IS DISTINCT FROM NEW.id
    AND (
      (NEW.ios = true AND existing.ios = true)
      OR (NEW.android = true AND existing.android = true)
      OR (NEW.electron = true AND existing.electron = true)
    );

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.normalize_public_channel_overlap() OWNER TO "postgres";
REVOKE ALL ON FUNCTION public.normalize_public_channel_overlap() FROM PUBLIC;

DROP TRIGGER IF EXISTS normalize_public_channel_overlap_before_upsert ON public.channels;
CREATE TRIGGER normalize_public_channel_overlap_before_upsert
BEFORE INSERT OR UPDATE OF public, ios, android, electron, app_id
ON public.channels
FOR EACH ROW
EXECUTE FUNCTION public.normalize_public_channel_overlap();

-- Normalize any pre-existing conflicting public rows so the unique indexes can
-- be added safely. Keep the newest overlapping row and demote older ones,
-- matching the intended "last public write wins" behavior.
UPDATE public.channels AS older
SET public = false
WHERE older.public = true
  AND EXISTS (
    SELECT 1
    FROM public.channels AS newer
    WHERE newer.app_id = older.app_id
      AND newer.public = true
      AND newer.id <> older.id
      AND (
        (older.ios = true AND newer.ios = true)
        OR (older.android = true AND newer.android = true)
        OR (older.electron = true AND newer.electron = true)
      )
      AND (
        newer.updated_at > older.updated_at
        OR (newer.updated_at = older.updated_at AND newer.created_at > older.created_at)
        OR (newer.updated_at = older.updated_at AND newer.created_at = older.created_at AND newer.id > older.id)
      )
  );

CREATE UNIQUE INDEX IF NOT EXISTS channels_one_public_ios_per_app_key
ON public.channels (app_id)
WHERE public = true AND ios = true;

CREATE UNIQUE INDEX IF NOT EXISTS channels_one_public_android_per_app_key
ON public.channels (app_id)
WHERE public = true AND android = true;

CREATE UNIQUE INDEX IF NOT EXISTS channels_one_public_electron_per_app_key
ON public.channels (app_id)
WHERE public = true AND electron = true;
