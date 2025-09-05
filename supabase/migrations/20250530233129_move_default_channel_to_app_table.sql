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
DECLARE
    current_ios_public BOOLEAN;
    current_android_public BOOLEAN;
BEGIN
    -- Only proceed if the default channel values actually changed
    IF (OLD.default_channel_ios IS NOT DISTINCT FROM NEW.default_channel_ios) 
       AND (OLD.default_channel_android IS NOT DISTINCT FROM NEW.default_channel_android) THEN
        RETURN NEW;
    END IF;

    -- Check current public status of the channels we're about to update
    IF NEW.default_channel_ios IS NOT NULL THEN
        SELECT public INTO current_ios_public
        FROM public.channels
        WHERE id = NEW.default_channel_ios AND app_id = NEW.app_id;
    END IF;
    
    IF NEW.default_channel_android IS NOT NULL THEN
        SELECT public INTO current_android_public
        FROM public.channels
        WHERE id = NEW.default_channel_android AND app_id = NEW.app_id;
    END IF;
    
    -- If channels are already in the correct public state, don't update
    IF (NEW.default_channel_ios IS NULL OR current_ios_public = TRUE)
       AND (NEW.default_channel_android IS NULL OR current_android_public = TRUE) THEN
        RETURN NEW;
    END IF;
    
    -- Mark all channels for this app as not public
    UPDATE public.channels
    SET public = FALSE
    WHERE app_id = NEW.app_id;

    -- Mark the default channels as public
    IF NEW.default_channel_ios IS NOT NULL THEN
        UPDATE public.channels
        SET public = TRUE
        WHERE id = NEW.default_channel_ios
        AND app_id = NEW.app_id;
    END IF;
    
    IF NEW.default_channel_android IS NOT NULL THEN
        UPDATE public.channels
        SET public = TRUE
        WHERE id = NEW.default_channel_android
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

-- Create a trigger function that syncs channels.public changes to apps table
CREATE OR REPLACE FUNCTION public.sync_channel_public_to_apps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    old_public BOOLEAN;
    new_public BOOLEAN;
    channel_ios BOOLEAN;
    channel_android BOOLEAN;
    current_ios_default BIGINT;
    current_android_default BIGINT;
BEGIN
    -- Get the old and new public values
    old_public := COALESCE(OLD.public, FALSE);
    new_public := COALESCE(NEW.public, FALSE);
    
    -- Only proceed if public status actually changed
    IF old_public = new_public THEN
        RETURN NEW;
    END IF;
    
    -- Get channel platform support
    channel_ios := NEW.ios;
    channel_android := NEW.android;
    
    -- Check current apps table state
    SELECT default_channel_ios, default_channel_android 
    INTO current_ios_default, current_android_default
    FROM public.apps
    WHERE app_id = NEW.app_id;
    
    -- If channel is being set to public (true)
    IF new_public = TRUE THEN
        -- Check if apps table already matches what we want to set
        IF (NOT channel_ios OR current_ios_default = NEW.id)
           AND (NOT channel_android OR current_android_default = NEW.id) THEN
            RETURN NEW; -- Apps table already correct, no update needed
        END IF;
        
        -- Update apps table to set this channel as default for supported platforms
        IF channel_ios THEN
            UPDATE public.apps
            SET default_channel_ios = NEW.id
            WHERE app_id = NEW.app_id;
        END IF;
        
        IF channel_android THEN
            UPDATE public.apps
            SET default_channel_android = NEW.id
            WHERE app_id = NEW.app_id;
        END IF;
        
        -- Mark conflicting channels as non-public
        IF channel_ios THEN
            UPDATE public.channels
            SET public = FALSE
            WHERE app_id = NEW.app_id 
            AND id != NEW.id 
            AND ios = TRUE
            AND public = TRUE;
        END IF;
        
        IF channel_android THEN
            UPDATE public.channels
            SET public = FALSE
            WHERE app_id = NEW.app_id 
            AND id != NEW.id 
            AND android = TRUE
            AND public = TRUE;
        END IF;
        
    -- If channel is being set to non-public (false)
    ELSE
        -- Check if apps table needs updating
        IF (NOT channel_ios OR current_ios_default != NEW.id)
           AND (NOT channel_android OR current_android_default != NEW.id) THEN
            RETURN NEW; -- Apps table already correct, no update needed
        END IF;
        
        -- Remove this channel as default from apps table
        IF channel_ios AND current_ios_default = NEW.id THEN
            UPDATE public.apps
            SET default_channel_ios = NULL
            WHERE app_id = NEW.app_id;
        END IF;
        
        IF channel_android AND current_android_default = NEW.id THEN
            UPDATE public.apps
            SET default_channel_android = NULL
            WHERE app_id = NEW.app_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create triggers for the channels table
DROP TRIGGER IF EXISTS manage_channel_public_status_trigger ON public.channels;
CREATE TRIGGER sync_channel_public_to_apps_trigger
AFTER UPDATE OF public
ON public.channels
FOR EACH ROW
EXECUTE FUNCTION public.sync_channel_public_to_apps();

-- Also create a trigger for INSERT to handle new channels marked as public
CREATE TRIGGER sync_channel_public_to_apps_insert_trigger
AFTER INSERT
ON public.channels
FOR EACH ROW
WHEN (NEW.public = TRUE)
EXECUTE FUNCTION public.sync_channel_public_to_apps();

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