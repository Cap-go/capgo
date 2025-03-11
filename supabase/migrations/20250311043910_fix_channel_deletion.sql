-- Migration file: fix_channel_deletion.sql
-- Prevents channel deletion when setting and unsetting channel from device
-- Fixes issue #1011 and #1038

-- Step 1: Drop the existing foreign key constraints with CASCADE DELETE
ALTER TABLE ONLY public.channel_devices
    DROP CONSTRAINT IF EXISTS channel_devices_channel_id_fkey;

ALTER TABLE ONLY public.org_users
    DROP CONSTRAINT IF EXISTS org_users_channel_id_fkey;

-- Step 2: Add new foreign key constraints with RESTRICT instead of CASCADE
-- This ensures channels cannot be deleted if they have device references
ALTER TABLE ONLY public.channel_devices
    ADD CONSTRAINT channel_devices_channel_id_fkey 
    FOREIGN KEY (channel_id) REFERENCES public.channels(id) 
    ON DELETE RESTRICT;

ALTER TABLE ONLY public.org_users
    ADD CONSTRAINT org_users_channel_id_fkey 
    FOREIGN KEY (channel_id) REFERENCES public.channels(id) 
    ON DELETE RESTRICT;

-- Step 3: Add comments to explain the purpose of these migrations
COMMENT ON CONSTRAINT channel_devices_channel_id_fkey ON public.channel_devices IS 
'Prevents channel deletion when channel_devices are deleted. Changed from CASCADE to RESTRICT.';

COMMENT ON CONSTRAINT org_users_channel_id_fkey ON public.org_users IS 
'Prevents channel deletion when org_users are deleted. Changed from CASCADE to RESTRICT.';

-- Step 4: Create a function to prevent channel deletion in other scenarios
CREATE OR REPLACE FUNCTION public.prevent_channel_deletion()
RETURNS TRIGGER AS $$
BEGIN
    -- This function prevents channel deletion in various scenarios
    RAISE EXCEPTION 'Channel deletion is not allowed. Channels must be preserved to maintain system integrity.';
    RETURN NULL; -- Never reached due to exception
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create a trigger to prevent direct channel deletion
DROP TRIGGER IF EXISTS prevent_direct_channel_deletion_trigger ON public.channels;
CREATE TRIGGER prevent_direct_channel_deletion_trigger
BEFORE DELETE ON public.channels
FOR EACH ROW
EXECUTE FUNCTION public.prevent_channel_deletion();

-- Step 6: Add a comment to explain the purpose of this trigger
COMMENT ON TRIGGER prevent_direct_channel_deletion_trigger ON public.channels IS 
'Prevents direct deletion of channels to maintain system integrity.';
