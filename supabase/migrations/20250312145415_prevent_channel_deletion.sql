-- Migration to prevent channel deletion when setting and unsetting channel from device
-- This fixes issues #1038 and #1011

-- Step 1: Drop the existing foreign key constraint that uses CASCADE DELETE
ALTER TABLE ONLY "public"."channel_devices"
    DROP CONSTRAINT IF EXISTS "channel_devices_channel_id_fkey";

-- Step 2: Create a new foreign key constraint with RESTRICT instead of CASCADE
ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_channel_id_fkey" 
    FOREIGN KEY ("channel_id") 
    REFERENCES "public"."channels"("id") 
    ON DELETE RESTRICT;

-- Step 3: Create a function to log attempts to delete channels with device associations
CREATE OR REPLACE FUNCTION public.prevent_channel_deletion_with_devices()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if the channel being deleted has associated devices
    IF EXISTS (
        SELECT 1 FROM public.channel_devices
        WHERE channel_id = OLD.id
    ) THEN
        RAISE EXCEPTION 'Cannot delete channel with ID % because it has associated devices', OLD.id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create a trigger to prevent deletion of channels with device associations
DROP TRIGGER IF EXISTS prevent_channel_deletion_trigger ON public.channels;

CREATE TRIGGER prevent_channel_deletion_trigger
    BEFORE DELETE ON public.channels
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_channel_deletion_with_devices();
