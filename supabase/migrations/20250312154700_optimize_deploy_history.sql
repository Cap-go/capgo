-- Add composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS deploy_history_channel_app_idx ON "public"."deploy_history" (channel_id, app_id);
CREATE INDEX IF NOT EXISTS deploy_history_app_deployed_at_idx ON "public"."deploy_history" (app_id, deployed_at);
CREATE INDEX IF NOT EXISTS deploy_history_channel_deployed_at_idx ON "public"."deploy_history" (channel_id, deployed_at);

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
        AND is_current = TRUE;
        
        -- Get link and comment from the version
        INSERT INTO deploy_history (
            channel_id, 
            app_id, 
            version_id, 
            is_current,
            owner_org,
            link,
            comment
        )
        SELECT 
            NEW.id,
            NEW.app_id,
            NEW.version,
            TRUE,
            NEW.owner_org,
            v.link,
            v.comment
        FROM app_versions v
        WHERE v.id = NEW.version;
    END IF;
    
    RETURN NEW;
END;
$function$;

-- Create a function for efficient deploy history retrieval
CREATE OR REPLACE FUNCTION public.get_deploy_history(
    p_channel_id BIGINT,
    p_app_id VARCHAR,
    p_page INT,
    p_page_size INT,
    p_sort_field VARCHAR DEFAULT 'deployed_at',
    p_sort_direction VARCHAR DEFAULT 'desc'
)
RETURNS TABLE (
    id BIGINT,
    deployed_at TIMESTAMPTZ,
    link TEXT,
    comment TEXT,
    is_current BOOLEAN,
    version_id BIGINT,
    version_name VARCHAR,
    total_count BIGINT
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_offset INT;
    v_sort_direction VARCHAR;
    v_total_count BIGINT;
BEGIN
    -- Calculate offset
    v_offset := (p_page - 1) * p_page_size;
    
    -- Validate sort direction
    v_sort_direction := CASE WHEN p_sort_direction = 'asc' THEN 'ASC' ELSE 'DESC' END;
    
    -- Get total count
    SELECT COUNT(*) INTO v_total_count
    FROM deploy_history
    WHERE channel_id = p_channel_id AND app_id = p_app_id;
    
    -- Return the results
    RETURN QUERY EXECUTE format('
        SELECT 
            dh.id,
            dh.deployed_at,
            dh.link,
            dh.comment,
            dh.is_current,
            dh.version_id,
            av.name AS version_name,
            %L::BIGINT AS total_count
        FROM deploy_history dh
        JOIN app_versions av ON dh.version_id = av.id
        WHERE dh.channel_id = %L AND dh.app_id = %L
        ORDER BY dh.%I ' || v_sort_direction || '
        LIMIT %L OFFSET %L
    ', v_total_count, p_channel_id, p_app_id, p_sort_field, p_page_size, v_offset);
END;
$function$;
