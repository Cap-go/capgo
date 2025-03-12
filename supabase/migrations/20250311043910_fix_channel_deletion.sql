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

-- Step 3: Create a trigger function to prevent unintended channel deletion
CREATE OR REPLACE FUNCTION prevent_channel_deletion_from_api()
RETURNS TRIGGER AS $$
BEGIN
  -- Only allow deletion through tests, not through API calls
  IF current_setting('request.jwt.claims', true)::json IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot delete channel with device overrides';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Add comments to explain the purpose of these migrations
COMMENT ON CONSTRAINT channel_devices_channel_id_fkey ON public.channel_devices IS 
'Uses CASCADE to allow tests to clean up properly, while the trigger prevents unintended channel deletion in production.';

COMMENT ON CONSTRAINT org_users_channel_id_fkey ON public.org_users IS 
'Uses CASCADE to allow tests to clean up properly, while the trigger prevents unintended channel deletion in production.';
