CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bandwidth_usage_timestamp_app_id
  ON public.bandwidth_usage USING btree (timestamp, app_id);
