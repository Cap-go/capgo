-- Create a trigger function to prevent channel deletion when channel_devices are deleted
CREATE OR REPLACE FUNCTION prevent_channel_deletion_on_device_change()
RETURNS TRIGGER AS $$
BEGIN
  -- This function is called when a channel_devices record is deleted
  -- It doesn't need to do anything, just prevent cascading deletes
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger on channel_devices table
DROP TRIGGER IF EXISTS prevent_channel_deletion_trigger ON public.channel_devices;
CREATE TRIGGER prevent_channel_deletion_trigger
BEFORE DELETE ON public.channel_devices
FOR EACH ROW
EXECUTE FUNCTION prevent_channel_deletion_on_device_change();

-- Modify the foreign key constraint to prevent cascade deletion
ALTER TABLE ONLY public.channel_devices
DROP CONSTRAINT IF EXISTS channel_devices_channel_id_fkey;

ALTER TABLE ONLY public.channel_devices
ADD CONSTRAINT channel_devices_channel_id_fkey 
FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE RESTRICT;
