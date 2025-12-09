-- Drop the existing foreign key constraint without CASCADE
ALTER TABLE public.channel_devices 
DROP CONSTRAINT channel_devices_channel_id_fkey;

-- Recreate the constraint with ON DELETE CASCADE
-- This ensures that when a channel is deleted, all associated channel_devices are automatically deleted
ALTER TABLE public.channel_devices
ADD CONSTRAINT channel_devices_channel_id_fkey 
FOREIGN KEY (channel_id) 
REFERENCES public.channels (id) 
ON DELETE CASCADE;

