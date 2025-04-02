ALTER TABLE public.apps 
ADD COLUMN default_channel_ios bigint REFERENCES public.channels(id);

ALTER TABLE public.apps 
ADD COLUMN default_channel_android bigint REFERENCES public.channels(id);

ALTER TABLE public.apps 
ADD COLUMN default_channel_sync boolean DEFAULT false;

UPDATE public.apps a
SET 
    default_channel_android = android_channels.id,
    default_channel_ios = ios_channels.id,
    default_channel_sync = CASE 
        WHEN android_channels.id IS NOT NULL AND ios_channels.id IS NOT NULL AND android_channels.id = ios_channels.id THEN true
        WHEN android_channels.id IS NULL AND ios_channels.id IS NULL THEN true
        ELSE false
    END
FROM 
    (SELECT DISTINCT ON (app_id) app_id, id
     FROM public.channels
     WHERE public = true AND android = true
     ORDER BY app_id, updated_at DESC) android_channels,
    (SELECT DISTINCT ON (app_id) app_id, id
     FROM public.channels
     WHERE public = true AND ios = true
     ORDER BY app_id, updated_at DESC) ios_channels
WHERE 
    a.app_id = android_channels.app_id
    OR a.app_id = ios_channels.app_id;

ALTER TABLE public.channels 
DROP COLUMN public;

ALTER TABLE public.apps
DROP CONSTRAINT IF EXISTS apps_default_channel_ios_fkey;

ALTER TABLE public.apps
DROP CONSTRAINT IF EXISTS apps_default_channel_android_fkey;

ALTER TABLE public.apps
ADD CONSTRAINT apps_default_channel_ios_fkey
FOREIGN KEY (default_channel_ios)
REFERENCES public.channels(id)
ON DELETE SET NULL;

ALTER TABLE public.apps
ADD CONSTRAINT apps_default_channel_android_fkey
FOREIGN KEY (default_channel_android)
REFERENCES public.channels(id)
ON DELETE SET NULL; 

ALTER TABLE public.apps
ALTER COLUMN default_channel_sync SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_apps_default_channel_ios ON public.apps(default_channel_ios);
CREATE INDEX IF NOT EXISTS idx_apps_default_channel_android ON public.apps(default_channel_android);
