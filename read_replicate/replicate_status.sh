#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=read_replicate/common.sh
source "${SCRIPT_DIR}/common.sh"

load_replica_target
load_source
DEFAULT_SUBSCRIPTION_NAME="capgo_google_$(replica_region_name)"
discover_subscription "$DEFAULT_SUBSCRIPTION_NAME"
print_target_summary

echo ""
echo "==> Target subscription definition"
psql-17 "$REPLICA_TARGET_DB_URL" -c "
  SELECT subname, subenabled, subslotname, subpublications
  FROM pg_subscription
  WHERE subname = '${REPLICA_SUBSCRIPTION_NAME}';
"

echo ""
echo "==> Target subscription runtime"
psql-17 "$REPLICA_TARGET_DB_URL" -c "
  SELECT
    subname,
    pid,
    received_lsn,
    latest_end_lsn,
    now() - last_msg_receipt_time AS no_message_for,
    last_msg_receipt_time
  FROM pg_stat_subscription
  WHERE subname = '${REPLICA_SUBSCRIPTION_NAME}';
"

echo ""
echo "==> Target table states"
psql-17 "$REPLICA_TARGET_DB_URL" -c "
  SELECT sr.srrelid::regclass AS table_name, sr.srsubstate, sr.srsublsn
  FROM pg_subscription_rel sr
  INNER JOIN pg_subscription s ON s.oid = sr.srsubid
  WHERE s.subname = '${REPLICA_SUBSCRIPTION_NAME}'
  ORDER BY sr.srrelid::regclass;
"

echo ""
echo "==> Source replication slot"
psql-17 "$SOURCE_DB_URL" -c "
  SELECT
    slot_name,
    active,
    active_pid,
    wal_status,
    invalidation_reason,
    restart_lsn,
    confirmed_flush_lsn,
    pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)) AS confirmed_lag
  FROM pg_replication_slots
  WHERE slot_name = '${REPLICA_SLOT_NAME}';
"

echo ""
echo "==> Source sender process"
psql-17 "$SOURCE_DB_URL" -c "
  SELECT
    application_name,
    state,
    sent_lsn,
    write_lsn,
    flush_lsn,
    replay_lsn,
    sync_state
  FROM pg_stat_replication
  WHERE application_name = '${REPLICA_SUBSCRIPTION_NAME}'
     OR application_name = '${REPLICA_SLOT_NAME}';
"
