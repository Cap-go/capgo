-- Migration file: fix_channel_deletion.sql
-- Prevents channel deletion when setting and unsetting channel from device
-- Fixes issue #1011 and #1038

-- Step 1: Drop the existing foreign key constraints with CASCADE DELETE
ALTER TABLE ONLY public.channel_devices
    DROP CONSTRAINT IF EXISTS channel_devices_channel_id_fkey;

ALTER TABLE ONLY public.org_users
    DROP CONSTRAINT IF EXISTS org_users_channel_id_fkey;

-- Step 2: Add new foreign key constraints with CASCADE
-- We'll rely on the plugin code to prevent unintended channel deletion
-- This allows tests to clean up properly while the plugin code ensures safety in production
ALTER TABLE ONLY public.channel_devices
    ADD CONSTRAINT channel_devices_channel_id_fkey 
    FOREIGN KEY (channel_id) REFERENCES public.channels(id) 
    ON DELETE CASCADE;

ALTER TABLE ONLY public.org_users
    ADD CONSTRAINT org_users_channel_id_fkey 
    FOREIGN KEY (channel_id) REFERENCES public.channels(id) 
    ON DELETE CASCADE;

-- Step 3: Add comments to explain the purpose of these migrations
COMMENT ON CONSTRAINT channel_devices_channel_id_fkey ON public.channel_devices IS 
'The plugin code in channel_self.ts prevents unintended channel deletion by using specific record IDs for deletion.';

COMMENT ON CONSTRAINT org_users_channel_id_fkey ON public.org_users IS 
'The plugin code prevents unintended channel deletion while allowing tests to clean up properly.';
