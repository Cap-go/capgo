-- Replace device version ID storage with version name and update stats logs accordingly
BEGIN;

ALTER TABLE public.devices
ADD COLUMN IF NOT EXISTS version_name text;

DROP INDEX IF EXISTS idx_app_id_version_devices;

UPDATE public.devices d
SET
  version_name = av.name
FROM
  public.app_versions av
WHERE
  av.id = d.version
  AND (
    d.version_name IS NULL
    OR d.version_name = ''
  );

UPDATE public.devices
SET
  version_name = COALESCE(NULLIF(version_name, ''), 'unknown')
WHERE
  version_name IS NULL
  OR version_name = '';

ALTER TABLE public.devices
ALTER COLUMN version_name
SET DEFAULT 'unknown';

ALTER TABLE public.devices
ALTER COLUMN version_name
SET NOT NULL;

-- TODO: remove the old version column in a future migration
-- ALTER TABLE public.devices
--   DROP COLUMN IF EXISTS version;
ALTER TABLE public.devices
ALTER COLUMN version
DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_app_id_version_name_devices ON public.devices (app_id, version_name);

ALTER TABLE public.stats
ADD COLUMN IF NOT EXISTS version_name text;

DROP INDEX IF EXISTS idx_stats_app_id_version;

UPDATE public.stats s
SET
  version_name = av.name
FROM
  public.app_versions av
WHERE
  av.id = s.version
  AND (
    s.version_name IS NULL
    OR s.version_name = ''
  );

UPDATE public.stats
SET
  version_name = COALESCE(NULLIF(version_name, ''), 'unknown')
WHERE
  version_name IS NULL
  OR version_name = '';

ALTER TABLE public.stats
ALTER COLUMN version_name
SET DEFAULT 'unknown';

ALTER TABLE public.stats
ALTER COLUMN version_name
SET NOT NULL;

ALTER TABLE public.stats
DROP COLUMN IF EXISTS version;

CREATE INDEX IF NOT EXISTS idx_stats_app_id_version_name ON public.stats (app_id, version_name);

COMMIT;
