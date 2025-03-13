-- Drop the existing foreign key constraint from channel_devices
ALTER TABLE "public"."channel_devices" 
DROP CONSTRAINT IF EXISTS "channel_devices_channel_id_fkey";

-- Re-add the foreign key with no ON DELETE clause
-- This ensures channels never get deleted when channel_devices are deleted
ALTER TABLE "public"."channel_devices" 
ADD CONSTRAINT "channel_devices_channel_id_fkey" 
FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id"); 
