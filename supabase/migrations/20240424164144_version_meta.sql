CREATE TABLE version_meta (
  timestamp TIMESTAMP,
  app_id VARCHAR(255),
  version_id BIGINT,
  size BIGINT,
  PRIMARY KEY (timestamp, app_id, version_id, size)
);
CREATE INDEX idx_version_meta_timestamp ON version_meta (timestamp);
CREATE INDEX idx_version_meta_app_id ON version_meta (app_id);
CREATE INDEX idx_version_meta_version_id ON version_meta (version_id);

CREATE OR REPLACE FUNCTION update_daily_storage() RETURNS void AS $$
DECLARE
    yesterday_date DATE := CURRENT_DATE - INTERVAL '1 day';
BEGIN
    WITH daily_version_meta AS (
        SELECT
            app_id,
            SUM(size) AS total_storage
        FROM
            version_meta
        WHERE
            timestamp >= yesterday_date AND timestamp < CURRENT_DATE
        GROUP BY
            app_id
    )
    INSERT INTO daily_storage (app_id, date, storage)
    SELECT
        app_id,
        yesterday_date,
        total_storage
    FROM
        daily_version_meta
    ON CONFLICT (app_id, date) DO UPDATE
    SET storage = EXCLUDED.storage;
END;
$$ LANGUAGE plpgsql;

-- Schedule the function to run daily at 1:00 AM
SELECT cron.schedule('Update Daily Storage', '0 1 * * *', $$SELECT update_daily_storage()$$);

DROP TRIGGER on_version_create ON "public"."app_versions";
CREATE TRIGGER on_version_create 
AFTER INSERT ON public.app_versions 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_version_create');

DROP TRIGGER on_version_update ON "public"."app_versions";
CREATE TRIGGER on_version_update 
AFTER UPDATE ON public.app_versions 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_version_update');
