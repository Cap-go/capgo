-- Migration to fix channel deletion issue when setting and unsetting channel from device
-- This migration changes the ON DELETE CASCADE constraint to ON DELETE RESTRICT
-- for the channel_devices table's foreign key reference to channels

-- First, drop the existing constraint
ALTER TABLE ONLY "public"."channel_devices"
    DROP CONSTRAINT IF EXISTS "channel_devices_channel_id_fkey";

-- Then, add the new constraint with ON DELETE RESTRICT
ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_channel_id_fkey" 
    FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") 
    ON DELETE RESTRICT;

-- Add a comment explaining the constraint
COMMENT ON CONSTRAINT "channel_devices_channel_id_fkey" ON "public"."channel_devices" 
IS 'Prevents channel deletion when channel_devices are deleted';
