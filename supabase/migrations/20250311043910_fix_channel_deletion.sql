-- Migration file: fix_channel_deletion.sql
-- Prevents channel deletion when setting and unsetting channel from device
-- Fixes issue #1011 and #1038

-- Step 1: Drop the existing foreign key constraints with CASCADE DELETE
ALTER TABLE ONLY public.channel_devices
    DROP CONSTRAINT IF EXISTS channel_devices_channel_id_fkey;

ALTER TABLE ONLY public.org_users
    DROP CONSTRAINT IF EXISTS org_users_channel_id_fkey;

-- Step 2: Add new foreign key constraints with SET NULL instead of CASCADE
-- This ensures channels are not deleted when channel_devices are deleted
-- but allows tests to clean up channels by first setting channel_id to NULL
ALTER TABLE ONLY public.channel_devices
    ADD CONSTRAINT channel_devices_channel_id_fkey 
    FOREIGN KEY (channel_id) REFERENCES public.channels(id) 
    ON DELETE SET NULL;

ALTER TABLE ONLY public.org_users
    ADD CONSTRAINT org_users_channel_id_fkey 
    FOREIGN KEY (channel_id) REFERENCES public.channels(id) 
    ON DELETE SET NULL;

-- Step 3: Add comments to explain the purpose of these migrations
COMMENT ON CONSTRAINT channel_devices_channel_id_fkey ON public.channel_devices IS 
'Prevents channel deletion when channel_devices are deleted. Changed from CASCADE to SET NULL.';

COMMENT ON CONSTRAINT org_users_channel_id_fkey ON public.org_users IS 
'Prevents channel deletion when org_users are deleted. Changed from CASCADE to SET NULL.';
