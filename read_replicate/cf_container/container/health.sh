#!/bin/sh
# Node status as JSON, served by health_server.pl on :8080/health.
PHASE="$(cat /tmp/capgo-phase 2>/dev/null || echo unknown)"
STATUS="$(/usr/bin/psql -X -h /var/run/postgresql -U postgres -d "${PG_DATABASE:-postgres}" -At 2>/dev/null <<'SQL'
SELECT json_build_object(
  'node', current_setting('cluster_name'),
  'in_recovery', pg_is_in_recovery(),
  'last_replay_at', pg_last_xact_replay_timestamp(),
  'replay_lag_s', CASE WHEN pg_is_in_recovery()
    THEN round(extract(epoch FROM now() - pg_last_xact_replay_timestamp())::numeric, 1) END,
  'timeline', (SELECT timeline_id FROM pg_control_checkpoint()),
  'db_size_bytes', pg_database_size(current_database()),
  'subscriptions', (SELECT json_agg(json_build_object('name', subname, 'enabled', subenabled)) FROM pg_subscription),
  'tables_not_ready', (SELECT count(*) FROM pg_subscription_rel WHERE srsubstate <> 'r'),
  'last_msg_receipt', (SELECT max(last_msg_receipt_time) FROM pg_stat_subscription),
  'archiver', (SELECT json_build_object('archived', archived_count, 'last_archived_at', last_archived_time,
    'failed', failed_count, 'last_failed_at', last_failed_time) FROM pg_stat_archiver)
);
SQL
)"
[ -n "$STATUS" ] || STATUS=null
printf '{"phase":"%s","postgres":%s,"disk":"%s"}\n' "$PHASE" "$STATUS" \
  "$(df -h /var/lib/postgresql | awk 'NR==2 {print $3"/"$2}')"
