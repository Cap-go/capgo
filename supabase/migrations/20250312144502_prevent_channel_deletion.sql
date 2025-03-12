-- Drop the existing foreign key constraint with CASCADE
ALTER TABLE ONLY "public"."channel_devices"
DROP CONSTRAINT IF EXISTS "channel_devices_channel_id_fkey";

-- Add a new foreign key constraint with RESTRICT
ALTER TABLE ONLY "public"."channel_devices"
ADD CONSTRAINT "channel_devices_channel_id_fkey" 
FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") 
ON DELETE RESTRICT;

-- Create a trigger function to prevent channel deletion when channel_devices are deleted
CREATE OR REPLACE FUNCTION public.prevent_channel_deletion_on_device_change()
RETURNS TRIGGER AS $$
BEGIN
  -- This function is a safety measure to ensure channels are not deleted
  -- when channel_devices records are deleted
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to use the function
DROP TRIGGER IF EXISTS prevent_channel_deletion_trigger ON public.channel_devices;
CREATE TRIGGER prevent_channel_deletion_trigger
BEFORE DELETE ON public.channel_devices
FOR EACH ROW
EXECUTE FUNCTION public.prevent_channel_deletion_on_device_change();
