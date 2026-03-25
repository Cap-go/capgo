CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_device_usage_timestamp_app_id
  ON public.device_usage USING btree (timestamp, app_id);
