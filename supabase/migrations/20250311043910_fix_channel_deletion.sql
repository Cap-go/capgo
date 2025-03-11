-- Migration file: fix_channel_deletion.sql
-- Prevents channel deletion when setting and unsetting channel from device
-- Fixes issue #1011

-- We don't need a trigger function since we're using RESTRICT constraint
-- The RESTRICT constraint will prevent deletion of channels that have references
-- This is a more direct and reliable approach than using triggers

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
