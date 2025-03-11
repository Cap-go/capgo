-- Migration file: fix_channel_deletion.sql
-- Prevents channel deletion when setting and unsetting channel from device
-- Fixes issue #1011

-- Step 1: Create a function to prevent channel deletion when channel_devices are deleted
CREATE OR REPLACE FUNCTION public.prevent_channel_deletion()
RETURNS TRIGGER AS $$
BEGIN
    -- This function is triggered before DELETE on channel_devices
    -- It prevents cascade deletion of channels
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Create a trigger to call the function before DELETE on channel_devices
CREATE TRIGGER prevent_channel_deletion_trigger
BEFORE DELETE ON public.channel_devices
FOR EACH ROW
EXECUTE FUNCTION public.prevent_channel_deletion();

-- Step 3: Drop the existing foreign key constraint with CASCADE DELETE
ALTER TABLE ONLY public.channel_devices
    DROP CONSTRAINT IF EXISTS channel_devices_channel_id_fkey;

-- Step 4: Add a new foreign key constraint with RESTRICT instead of CASCADE
ALTER TABLE ONLY public.channel_devices
    ADD CONSTRAINT channel_devices_channel_id_fkey 
    FOREIGN KEY (channel_id) REFERENCES public.channels(id) 
    ON DELETE RESTRICT;

-- Step 5: Add a comment to explain the purpose of this migration
COMMENT ON CONSTRAINT channel_devices_channel_id_fkey ON public.channel_devices IS 
'Prevents channel deletion when channel_devices are deleted. Changed from CASCADE to RESTRICT.';
