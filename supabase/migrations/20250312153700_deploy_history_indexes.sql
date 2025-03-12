-- Add indexes to improve query performance on deploy_history table
CREATE INDEX IF NOT EXISTS deploy_history_channel_id_idx ON "public"."deploy_history" (channel_id);
CREATE INDEX IF NOT EXISTS deploy_history_app_id_idx ON "public"."deploy_history" (app_id);
CREATE INDEX IF NOT EXISTS deploy_history_version_id_idx ON "public"."deploy_history" (version_id);
CREATE INDEX IF NOT EXISTS deploy_history_deployed_at_idx ON "public"."deploy_history" (deployed_at);
CREATE INDEX IF NOT EXISTS deploy_history_is_current_idx ON "public"."deploy_history" (is_current);

-- Add composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS deploy_history_channel_app_idx ON "public"."deploy_history" (channel_id, app_id);
CREATE INDEX IF NOT EXISTS deploy_history_app_version_idx ON "public"."deploy_history" (app_id, version_id);
CREATE INDEX IF NOT EXISTS deploy_history_channel_deployed_idx ON "public"."deploy_history" (channel_id, deployed_at);

-- Optimize the record_deployment_history trigger function
CREATE OR REPLACE FUNCTION public.record_deployment_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
    -- If version is changing, record the deployment
    IF OLD.version <> NEW.version THEN
        -- Only update records that are currently marked as current
        -- This is more efficient than updating all records
        UPDATE deploy_history
        SET is_current = FALSE
        WHERE channel_id = NEW.id
        AND is_current = TRUE
        -- Add this condition to avoid unnecessary updates
        AND version_id <> NEW.version;
        
        -- Only insert if this is actually a new version for this channel
        IF NOT EXISTS (
            SELECT 1 FROM deploy_history 
            WHERE channel_id = NEW.id AND version_id = NEW.version
        ) THEN
            -- Insert new record
            INSERT INTO deploy_history (
                channel_id, 
                app_id, 
            version_id, 
            is_current,
            owner_org
        )
        VALUES (
            NEW.id,
            NEW.app_id,
            NEW.version,
            TRUE,
            NEW.owner_org
        );
    END IF;
    
    RETURN NEW;
END;
$function$;
