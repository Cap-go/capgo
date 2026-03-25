CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_q_cron_stat_app_payload_app_id
  ON pgmq.q_cron_stat_app (((message->'payload'->>'appId')));
