CREATE OR REPLACE FUNCTION delete_failed_jobs() RETURNS void AS $$
BEGIN
    DELETE FROM job_queue
    WHERE status = 'failed'
      AND created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule('42 0 * * *', $$SELECT delete_failed_jobs();$$);
