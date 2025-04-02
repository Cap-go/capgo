-- Add default_channel_ios as reference to channels table (foreign key)
ALTER TABLE public.apps 
ADD COLUMN default_channel_ios bigint REFERENCES public.channels(id);

-- Add default_channel_android as reference to channels table (foreign key)
ALTER TABLE public.apps 
ADD COLUMN default_channel_android bigint REFERENCES public.channels(id);

-- Add default_channel_sync boolean with default value of false
ALTER TABLE public.apps 
ADD COLUMN default_channel_sync boolean DEFAULT false;

-- Create a procedure to set default channels for all apps
DO $$
DECLARE
    app_record RECORD;
    android_channel bigint;
    ios_channel bigint;
    is_synced boolean;
BEGIN
    -- Loop through all apps
    FOR app_record IN SELECT app_id, id FROM public.apps LOOP
        -- Get the default Android channel (public and android enabled)
        SELECT id INTO android_channel
        FROM public.channels
        WHERE app_id = app_record.app_id
          AND public = true
          AND android = true
        ORDER BY updated_at DESC
        LIMIT 1;
        
        -- Get the default iOS channel (public and iOS enabled)
        SELECT id INTO ios_channel
        FROM public.channels
        WHERE app_id = app_record.app_id
          AND public = true
          AND ios = true
        ORDER BY updated_at DESC
        LIMIT 1;
        
        -- Check if channels are synced (same channel for both platforms)
        is_synced := ((android_channel IS NOT NULL AND ios_channel IS NOT NULL AND android_channel = ios_channel) OR (android_channel IS NULL AND ios_channel IS NULL));
        
        -- Update the app with the new values
        UPDATE public.apps
        SET default_channel_android = android_channel,
            default_channel_ios = ios_channel,
            default_channel_sync = is_synced
        WHERE id = app_record.id;
        
    END LOOP;
END $$;


-- Drop the default_channel_ios column
-- TODO at 2025-10-02: remove this public column
-- Still used in the CLI during upload, removing it will break the upload
-- ALTER TABLE public.channels 
-- DROP COLUMN public;



-- Drop existing foreign key constraints
ALTER TABLE public.apps
DROP CONSTRAINT IF EXISTS apps_default_channel_ios_fkey;

ALTER TABLE public.apps
DROP CONSTRAINT IF EXISTS apps_default_channel_android_fkey;

-- Re-add the constraints with ON DELETE SET NULL
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

-- Mark default_channel_sync as not null
ALTER TABLE public.apps
ALTER COLUMN default_channel_sync SET NOT NULL;

-- Create a trigger function that ensures default channels in apps are marked as public
CREATE OR REPLACE FUNCTION public.update_channel_public_from_app()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- If default_channel_ios is set, mark the corresponding channel as public
    IF NEW.default_channel_ios IS NOT NULL THEN
        UPDATE public.channels
        SET public = TRUE
        WHERE id = NEW.default_channel_ios
        AND app_id = NEW.app_id;
    ELSIF OLD.default_channel_ios IS NOT NULL THEN
        UPDATE public.channels 
        SET public = FALSE
        WHERE id = OLD.default_channel_ios
        AND app_id = NEW.app_id;
    END IF;
    
    -- If default_channel_android is set, mark the corresponding channel as public
    IF NEW.default_channel_android IS NOT NULL THEN
        UPDATE public.channels
        SET public = TRUE
        WHERE id = NEW.default_channel_android
        AND app_id = NEW.app_id;
    ELSIF OLD.default_channel_android IS NOT NULL THEN
        UPDATE public.channels
        SET public = FALSE
        WHERE id = OLD.default_channel_android
        AND app_id = NEW.app_id;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create a trigger for the apps table
DROP TRIGGER IF EXISTS update_default_channel_public_trigger ON public.apps;
CREATE TRIGGER update_default_channel_public_trigger
AFTER INSERT OR UPDATE OF default_channel_ios, default_channel_android
ON public.apps
FOR EACH ROW
EXECUTE FUNCTION public.update_channel_public_from_app();

-- Create a trigger function that manages the public flag for channels based on default status
CREATE OR REPLACE FUNCTION public.manage_channel_public_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_default BOOLEAN;
BEGIN
    -- Check if this channel is used as a default in any app with the same app_id
    SELECT EXISTS (
        SELECT 1 FROM public.apps
        WHERE (default_channel_ios = NEW.id OR default_channel_android = NEW.id)
        AND app_id = NEW.app_id
    ) INTO is_default;
    
    -- If this channel is a default channel, ensure it's marked as public
    IF is_default THEN
        NEW.public = TRUE;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create a trigger for the channels table
DROP TRIGGER IF EXISTS manage_channel_public_status_trigger ON public.channels;
CREATE TRIGGER manage_channel_public_status_trigger
BEFORE INSERT OR UPDATE
ON public.channels
FOR EACH ROW
EXECUTE FUNCTION public.manage_channel_public_status();

-- Procedure to sync all existing channels
DO $$
DECLARE
    channel_record RECORD;
    is_default BOOLEAN;
BEGIN
    -- Loop through all channels
    FOR channel_record IN SELECT id, app_id FROM public.channels LOOP
        -- Check if this channel is used as a default in any app with the same app_id
        SELECT EXISTS (
            SELECT 1 FROM public.apps
            WHERE (default_channel_ios = channel_record.id OR default_channel_android = channel_record.id)
            AND app_id = channel_record.app_id
        ) INTO is_default;
        
        -- If this channel is a default channel, ensure it's marked as public
        IF is_default THEN
            UPDATE public.channels
            SET public = TRUE
            WHERE id = channel_record.id;
        END IF;
    END LOOP;
    
    -- Log how many channels were potentially affected
    RAISE NOTICE 'Channel public status synchronization completed.';
END $$;