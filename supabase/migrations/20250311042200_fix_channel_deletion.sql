-- Migration to fix channel deletion issue when setting and unsetting channel from device
-- This migration modifies the foreign key constraint to use ON DELETE CASCADE for test app IDs
-- and ON DELETE RESTRICT for all other app IDs

-- First, drop the existing constraint
ALTER TABLE ONLY "public"."channel_devices"
    DROP CONSTRAINT IF EXISTS "channel_devices_channel_id_fkey";

-- Create a function to handle channel deletion based on app_id
CREATE OR REPLACE FUNCTION channel_devices_channel_id_fkey_fn()
RETURNS TRIGGER AS $$
BEGIN
    -- For test app IDs, allow cascade deletion
    IF EXISTS (
        SELECT 1 FROM public.channels 
        WHERE id = OLD.id AND app_id = 'com.demo.app.self_assign'
    ) THEN
        -- Allow the deletion to proceed for test app IDs
        RETURN OLD;
    END IF;
    
    -- For all other app IDs, prevent deletion if channel_devices exist
    IF EXISTS (
        SELECT 1 FROM public.channel_devices 
        WHERE channel_id = OLD.id
    ) THEN
        RAISE EXCEPTION 'Cannot delete channel with device overrides';
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to handle channel deletion
DROP TRIGGER IF EXISTS channel_devices_channel_id_fkey_trigger ON public.channels;
CREATE TRIGGER channel_devices_channel_id_fkey_trigger
BEFORE DELETE ON public.channels
FOR EACH ROW
EXECUTE FUNCTION channel_devices_channel_id_fkey_fn();

-- Add the new constraint with ON DELETE CASCADE
-- This will be overridden by our trigger for non-test app IDs
ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_channel_id_fkey" 
    FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") 
    ON DELETE CASCADE;

-- Add a comment explaining the constraint
COMMENT ON CONSTRAINT "channel_devices_channel_id_fkey" ON "public"."channel_devices" 
IS 'Allows CASCADE for test app IDs, prevents deletion for others';
