ALTER TABLE global_stats ADD COLUMN apps_active INTEGER DEFAULT 0;
ALTER TABLE global_stats ADD COLUMN users_active INTEGER DEFAULT 0;

CREATE OR REPLACE FUNCTION count_active_users(app_ids VARCHAR[])
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(DISTINCT user_id)
        FROM apps
        WHERE app_id = ANY(app_ids)
    );
END;
$$ LANGUAGE plpgsql;

