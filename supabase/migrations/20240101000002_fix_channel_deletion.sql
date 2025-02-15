-- Drop existing constraint
ALTER TABLE "public"."channel_devices" 
    DROP CONSTRAINT IF EXISTS "channel_devices_channel_id_fkey";

-- Re-add constraint with ON DELETE SET NULL
ALTER TABLE "public"."channel_devices" 
    ADD CONSTRAINT "channel_devices_channel_id_fkey" 
    FOREIGN KEY ("channel_id") 
    REFERENCES "public"."channels"("id") 
    ON DELETE SET NULL;

-- Add NOT NULL constraint to prevent accidental deletions
ALTER TABLE "public"."channels"
    ALTER COLUMN "name" SET NOT NULL,
    ALTER COLUMN "app_id" SET NOT NULL;

-- Add explicit deletion protection
CREATE OR REPLACE FUNCTION prevent_channel_deletion()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM public.channel_devices 
        WHERE channel_id = OLD.id
        LIMIT 1
    ) THEN
        RAISE EXCEPTION 'Cannot delete channel while devices are associated with it';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_channel_deletion_trigger ON public.channels;
CREATE TRIGGER prevent_channel_deletion_trigger
    BEFORE DELETE ON public.channels
    FOR EACH ROW
    EXECUTE FUNCTION prevent_channel_deletion();
