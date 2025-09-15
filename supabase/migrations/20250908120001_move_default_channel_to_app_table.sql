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

-- Create a trigger function that guards against making channels non-public when they're assigned as default channels
CREATE OR REPLACE FUNCTION public.guard_channel_public()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    old_public BOOLEAN;
    new_public BOOLEAN;
    old_ios BOOLEAN;
    new_ios BOOLEAN;
    old_android BOOLEAN;
    new_android BOOLEAN;
    current_ios_default BIGINT;
    current_android_default BIGINT;
BEGIN
    -- Get the old and new values
    old_public := COALESCE(OLD.public, FALSE);
    new_public := COALESCE(NEW.public, FALSE);
    old_ios := COALESCE(OLD.ios, FALSE);
    new_ios := COALESCE(NEW.ios, FALSE);
    old_android := COALESCE(OLD.android, FALSE);
    new_android := COALESCE(NEW.android, FALSE);
    
    -- Check current apps table state
    SELECT default_channel_ios, default_channel_android 
    INTO current_ios_default, current_android_default
    FROM public.apps
    WHERE app_id = NEW.app_id;
    
    -- Validate platform changes: prevent disabling platform support for default channels
    IF old_ios = TRUE AND new_ios = FALSE AND current_ios_default = NEW.id THEN
        RAISE EXCEPTION 'Cannot remove iOS platform support from channel "%" as it is assigned as default_channel_ios in the apps table. Remove the channel from default_channel_ios first.', NEW.name;
    END IF;
    
    IF old_android = TRUE AND new_android = FALSE AND current_android_default = NEW.id THEN
        RAISE EXCEPTION 'Cannot remove Android platform support from channel "%" as it is assigned as default_channel_android in the apps table. Remove the channel from default_channel_android first.', NEW.name;
    END IF;

    -- Validate platform changes: prevent enabling platform support in a way that violates default coherence
    -- Case 1: channel is iOS default and we are enabling Android support while Android default points to another channel
    IF old_android = FALSE AND new_android = TRUE
       AND current_ios_default = NEW.id
       AND current_android_default IS NOT NULL AND current_android_default <> NEW.id THEN
        RAISE EXCEPTION 'Cannot add Android platform support to channel "%" as it is assigned as default_channel_ios and a different Android default is set. Use the same channel for both platforms or set Android default to this channel first.', NEW.name;
    END IF;

    -- Case 2: channel is Android default and we are enabling iOS support while iOS default points to another channel
    IF old_ios = FALSE AND new_ios = TRUE
       AND current_android_default = NEW.id
       AND current_ios_default IS NOT NULL AND current_ios_default <> NEW.id THEN
        RAISE EXCEPTION 'Cannot add iOS platform support to channel "%" as it is assigned as default_channel_android and a different iOS default is set. Use the same channel for both platforms or set iOS default to this channel first.', NEW.name;
    END IF;
    
    -- Validate public status changes
    IF old_public = TRUE AND new_public = FALSE THEN
        -- Prevent making channels non-public when they're assigned as default channels
        IF current_ios_default = NEW.id OR current_android_default = NEW.id THEN
            RAISE EXCEPTION 'Cannot make channel "%" non-public as it is assigned as a default channel in the apps table. Remove the channel from default channels first.', NEW.name;
        END IF;
    ELSIF old_public = FALSE AND new_public = TRUE THEN
        -- Prevent making channels public unless they're specifically set as default channels in the apps table
        IF current_ios_default != NEW.id AND current_android_default != NEW.id THEN
            RAISE EXCEPTION 'Cannot make channel "%" public unless it is specifically set as a default channel in the apps table. Set the channel as default_channel_ios or default_channel_android first.', NEW.name;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Helper to atomically unset a default channel for a platform
-- Usage: SELECT public.unset_default_channel('com.demo.app', 'ios');
CREATE OR REPLACE FUNCTION public.unset_default_channel(
  p_app_id text,
  p_platform text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  d_ios bigint;
  d_android bigint;
BEGIN
  -- Defer constraint triggers so validations run on the final state
  SET CONSTRAINTS update_default_channel_public_trigger, guard_channel_public_trigger DEFERRED;

  IF p_platform IS NULL OR lower(p_platform) NOT IN ('ios','android','both') THEN
    RAISE EXCEPTION 'Invalid platform: % (expected ios|android|both)', p_platform;
  END IF;

  -- Ensure the app exists; raise if not, and load current defaults
  IF NOT EXISTS (SELECT 1 FROM public.apps WHERE app_id = p_app_id) THEN
    RAISE EXCEPTION 'App with app_id "%" not found', p_app_id;
  END IF;
  SELECT default_channel_ios, default_channel_android INTO d_ios, d_android
  FROM public.apps WHERE app_id = p_app_id LIMIT 1;

  IF lower(p_platform) = 'ios' THEN
    -- If the same channel is default for Android, disable iOS support on that channel
    IF d_ios IS NOT NULL AND d_android IS NOT NULL AND d_ios = d_android THEN
      UPDATE public.channels SET ios = FALSE WHERE id = d_ios;
    END IF;
    UPDATE public.apps
      SET default_channel_ios = NULL
      WHERE app_id = p_app_id;
  ELSIF lower(p_platform) = 'android' THEN
    -- If the same channel is default for iOS, disable Android support on that channel
    IF d_ios IS NOT NULL AND d_android IS NOT NULL AND d_ios = d_android THEN
      UPDATE public.channels SET android = FALSE WHERE id = d_android;
    END IF;
    UPDATE public.apps
      SET default_channel_android = NULL
      WHERE app_id = p_app_id;
  ELSE
    UPDATE public.apps
      SET default_channel_ios = NULL,
          default_channel_android = NULL
      WHERE app_id = p_app_id;
  END IF;

  -- Re-enable constraints immediately
  SET CONSTRAINTS update_default_channel_public_trigger, guard_channel_public_trigger IMMEDIATE;

  RETURN;
END;
$$;

-- Create triggers for the channels table
DROP TRIGGER IF EXISTS manage_channel_public_status_trigger ON public.channels;
DROP TRIGGER IF EXISTS sync_channel_public_to_apps_trigger ON public.channels;
DROP TRIGGER IF EXISTS sync_channel_public_to_apps_insert_trigger ON public.channels;
-- Recreate as DEFERRABLE CONSTRAINT TRIGGER (initially immediate)
DROP TRIGGER IF EXISTS guard_channel_public_trigger ON public.channels;
CREATE CONSTRAINT TRIGGER guard_channel_public_trigger
AFTER UPDATE OF public, ios, android
ON public.channels
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION public.guard_channel_public();

-- Create a trigger function that ensures default channels in apps are marked as public
CREATE OR REPLACE FUNCTION public.update_channel_public_from_app()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_ios_public BOOLEAN;
    current_android_public BOOLEAN;
    ios_channel_supports_android BOOLEAN;
    android_channel_supports_ios BOOLEAN;
    selected_ios_is_ios BOOLEAN;
    selected_ios_name TEXT;
    selected_android_is_android BOOLEAN;
    selected_android_name TEXT;
BEGIN
    -- Only proceed if the default channel values actually changed
    IF (OLD.default_channel_ios IS NOT DISTINCT FROM NEW.default_channel_ios) 
       AND (OLD.default_channel_android IS NOT DISTINCT FROM NEW.default_channel_android) THEN
        RETURN NEW;
    END IF;

    -- Validate platform conflicts before proceeding
    IF NEW.default_channel_ios IS NOT NULL AND NEW.default_channel_android IS NOT NULL 
       AND NEW.default_channel_ios != NEW.default_channel_android THEN
        
        -- Check if iOS channel also supports Android
        SELECT android INTO ios_channel_supports_android
        FROM public.channels
        WHERE id = NEW.default_channel_ios AND app_id = NEW.app_id;
        
        -- Check if Android channel also supports iOS  
        SELECT ios INTO android_channel_supports_ios
        FROM public.channels
        WHERE id = NEW.default_channel_android AND app_id = NEW.app_id;
        
        -- Reject if iOS channel supports Android but we're assigning a different Android channel
        IF ios_channel_supports_android = TRUE THEN
            RAISE EXCEPTION 'Cannot assign different channels for iOS and Android when the iOS channel (%) supports both platforms. Use the same channel for both platforms or choose an iOS-only channel.', 
                (SELECT name FROM public.channels WHERE id = NEW.default_channel_ios);
        END IF;
        
        -- Reject if Android channel supports iOS but we're assigning a different iOS channel
        IF android_channel_supports_ios = TRUE THEN
            RAISE EXCEPTION 'Cannot assign different channels for iOS and Android when the Android channel (%) supports both platforms. Use the same channel for both platforms or choose an Android-only channel.', 
                (SELECT name FROM public.channels WHERE id = NEW.default_channel_android);
        END IF;
    END IF;

    -- Validate selected defaults actually support their respective platforms
    IF NEW.default_channel_ios IS NOT NULL THEN
        SELECT ios, name INTO selected_ios_is_ios, selected_ios_name
        FROM public.channels
        WHERE id = NEW.default_channel_ios AND app_id = NEW.app_id;
        IF COALESCE(selected_ios_is_ios, FALSE) = FALSE THEN
            RAISE EXCEPTION 'Cannot assign iOS default to channel "%" that does not support iOS. Choose an iOS-capable channel.', selected_ios_name;
        END IF;
    END IF;

    IF NEW.default_channel_android IS NOT NULL THEN
        SELECT android, name INTO selected_android_is_android, selected_android_name
        FROM public.channels
        WHERE id = NEW.default_channel_android AND app_id = NEW.app_id;
        IF COALESCE(selected_android_is_android, FALSE) = FALSE THEN
            RAISE EXCEPTION 'Cannot assign Android default to channel "%" that does not support Android. Choose an Android-capable channel.', selected_android_name;
        END IF;
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
    
    -- Mark all channels for this app as not public
    UPDATE public.channels
    SET public = FALSE
    WHERE app_id = NEW.app_id
    AND id != NEW.default_channel_ios
    AND id != NEW.default_channel_android;

    IF NEW.default_channel_ios IS NULL AND OLD.default_channel_ios IS NOT NULL AND OLD.default_channel_ios != NEW.default_channel_android THEN
        UPDATE public.channels
        SET public = FALSE
        WHERE id = OLD.default_channel_ios
        AND app_id = NEW.app_id;
    END IF;
    
    -- RAISE NOTICE 'NEW.default_channel_android: %, OLD.default_channel_android: %, NEW.default_channel_ios: %', NEW.default_channel_android, OLD.default_channel_android, NEW.default_channel_ios;
    IF NEW.default_channel_android IS NULL AND OLD.default_channel_android IS NOT NULL AND OLD.default_channel_android != NEW.default_channel_ios THEN
        UPDATE public.channels
        SET public = FALSE
        WHERE id = OLD.default_channel_android
        AND app_id = NEW.app_id;
    END IF;

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
-- Recreate as DEFERRABLE CONSTRAINT TRIGGER (initially immediate)
DROP TRIGGER IF EXISTS update_default_channel_public_trigger ON public.apps;
CREATE CONSTRAINT TRIGGER update_default_channel_public_trigger
AFTER INSERT OR UPDATE OF default_channel_ios, default_channel_android
ON public.apps
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION public.update_channel_public_from_app();

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

-- Helper to atomically set a default channel for a platform, ensuring support
-- Usage: SELECT public.set_default_channel('com.demo.app', 'production', 'ios');
CREATE OR REPLACE FUNCTION public.set_default_channel(
  p_app_id text,
  p_channel_name text,
  p_platform text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_channel_id bigint;
  v_ios boolean;
  v_android boolean;
  d_ios bigint;
  d_android bigint;
  d_android_supports_android boolean;
  d_android_supports_ios boolean;
  d_ios_supports_ios boolean;
  d_ios_supports_android boolean;
BEGIN
  -- Defer constraint triggers so validations run on the final state
  -- (callers retain strict per-statement checks by default; this function defers internally)
  SET CONSTRAINTS update_default_channel_public_trigger, guard_channel_public_trigger DEFERRED;

  IF p_platform IS NULL OR lower(p_platform) NOT IN ('ios','android','both') THEN
    RAISE EXCEPTION 'Invalid platform: % (expected ios|android|both)', p_platform;
  END IF;

  SELECT id, ios, android INTO v_channel_id, v_ios, v_android
  FROM public.channels
  WHERE app_id = p_app_id AND name = p_channel_name
  LIMIT 1;

  IF v_channel_id IS NULL THEN
    RAISE EXCEPTION 'Channel "%" not found for app_id "%"', p_channel_name, p_app_id;
  END IF;

  -- Fetch current defaults for coherence adjustments
  SELECT default_channel_ios, default_channel_android INTO d_ios, d_android
  FROM public.apps
  WHERE app_id = p_app_id
  LIMIT 1;

  -- Fetch current platform support status for coherence adjustments
  SELECT android, ios INTO d_android_supports_android, d_ios_supports_ios
  FROM public.channels
  WHERE id = d_android
  LIMIT 1;

  SELECT android, ios INTO d_ios_supports_android, d_android_supports_android
  FROM public.channels
  WHERE id = d_ios
  LIMIT 1;

  -- Ensure channel supports the requested platform(s) (enable if needed) and adjust other platform if needed
  IF lower(p_platform) = 'ios' THEN
    IF COALESCE(v_ios, false) = false THEN
      UPDATE public.channels SET ios = true WHERE id = v_channel_id;
    END IF;
    -- If this channel currently supports Android and Android default is a different channel, disable Android on this channel to avoid mismatch
    IF COALESCE(v_android, false) = true AND d_android IS NOT NULL AND d_android <> v_channel_id THEN
      UPDATE public.channels SET android = false WHERE id = v_channel_id;
    END IF;
    -- If this channel currently supports iOS and iOS default is a different channel, disable iOS on this channel to avoid mismatch
    IF COALESCE(d_ios_supports_ios, false) = true AND d_ios IS NOT NULL AND d_ios <> v_channel_id THEN
      UPDATE public.channels SET ios = false WHERE id = d_ios;
    END IF;

    -- Assign default on app
    UPDATE public.apps SET default_channel_ios = v_channel_id WHERE app_id = p_app_id;
  ELSIF lower(p_platform) = 'android' THEN
    IF COALESCE(v_android, false) = false THEN
      UPDATE public.channels SET android = true WHERE id = v_channel_id;
    END IF;
    -- If this channel currently supports iOS and iOS default is a different channel, disable iOS on this channel to avoid mismatch
    IF COALESCE(v_ios, false) = true AND d_ios IS NOT NULL AND d_ios <> v_channel_id THEN
      UPDATE public.channels SET ios = false WHERE id = v_channel_id;
    END IF;
    -- If this channel currently supports Android and Android default is a different channel, disable Android on this channel to avoid mismatch
    IF COALESCE(d_android_supports_android, false) = true AND d_android IS NOT NULL AND d_android <> v_channel_id THEN
      UPDATE public.channels SET android = false WHERE id = d_android;
    END IF;
    -- Assign default on app
    UPDATE public.apps SET default_channel_android = v_channel_id WHERE app_id = p_app_id;
  ELSE
    -- both: enable both flags if needed, then set both defaults in a single UPDATE
    IF COALESCE(v_ios, false) = false THEN
      UPDATE public.channels SET ios = true WHERE id = v_channel_id;
    END IF;
    IF COALESCE(v_android, false) = false THEN
      UPDATE public.channels SET android = true WHERE id = v_channel_id;
    END IF;
    UPDATE public.apps
      SET default_channel_ios = v_channel_id,
          default_channel_android = v_channel_id
      WHERE app_id = p_app_id;
  END IF;

  SET CONSTRAINTS update_default_channel_public_trigger, guard_channel_public_trigger IMMEDIATE;

  RETURN;
END;
$$;
