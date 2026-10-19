#!/usr/bin/env bash
# Capgo read-replica node for Cloudflare Containers.
#
# Container disk is ephemeral, so R2 (via WAL-G) is the only durable state:
#   s3://<bucket>/<cluster>/basebackups_005/  full base backups
#   s3://<bucket>/<cluster>/wal_005/          archived WAL segments
#
# ROLE=primary
#   - R2 has a base backup: restore it, replay every archived WAL segment,
#     promote, and the Supabase subscription resumes from its restored origin.
#   - R2 is empty: initdb, load schema.sql, subscribe to Supabase with
#     copy_data=true, wait for every table to reach 'ready', push the first
#     base backup. Replicas wait for that backup.
#   - Always archives WAL to R2 (archive_timeout bounds replica lag) and pushes
#     a new base backup every BACKUP_INTERVAL_HOURS.
# ROLE=replica
#   - Waits for a base backup, restores it, and runs as a hot standby that
#     pulls WAL from R2 forever (restore_command). No network path to the
#     primary is needed.
set -Eeuo pipefail

ROLE="${ROLE:?ROLE must be primary or replica}"
NODE_NAME="${NODE_NAME:-$ROLE}"
PGDATA="${PGDATA:-/var/lib/postgresql/data}"
PG_DATABASE="${PG_DATABASE:-postgres}"
PG_SHARED_BUFFERS="${PG_SHARED_BUFFERS:-3GB}"
PG_EFFECTIVE_CACHE_SIZE="${PG_EFFECTIVE_CACHE_SIZE:-8GB}"
PG_MAX_CONNECTIONS="${PG_MAX_CONNECTIONS:-200}"
ARCHIVE_TIMEOUT="${ARCHIVE_TIMEOUT:-30}"
BACKUP_INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-24}"
BACKUP_RETAIN_FULL="${BACKUP_RETAIN_FULL:-2}"
PHASE_FILE=/tmp/capgo-phase
SOCKET_DIR=/var/run/postgresql

export PGDATA
export AWS_REGION="${AWS_REGION:-auto}"
export AWS_S3_FORCE_PATH_STYLE="${AWS_S3_FORCE_PATH_STYLE:-true}"
export WALG_COMPRESSION_METHOD="${WALG_COMPRESSION_METHOD:-zstd}"
export WALG_UPLOAD_CONCURRENCY="${WALG_UPLOAD_CONCURRENCY:-8}"
export WALG_DOWNLOAD_CONCURRENCY="${WALG_DOWNLOAD_CONCURRENCY:-8}"
export PGHOST="$SOCKET_DIR"
export PGUSER=postgres
: "${WALG_S3_PREFIX:?WALG_S3_PREFIX is required}"
: "${AWS_ENDPOINT:?AWS_ENDPOINT is required}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID is required}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${READER_PASSWORD:?READER_PASSWORD is required}"

log() { echo "[$(date -u +%FT%TZ)] [${NODE_NAME}] $*"; }
phase() { echo "$1" > "$PHASE_FILE"; log "phase=$1"; }
# The image runs as the postgres user; gosu only when started as root.
as_pg() { if [[ "$(id -u)" == "0" ]]; then gosu postgres "$@"; else "$@"; fi; }
psql_local() { as_pg psql -X -v ON_ERROR_STOP=1 -d "$PG_DATABASE" "$@"; }

PG_PID=""
FRESH_INIT=0
RESTORED_PRIMARY=0
PROMOTE_STABLE_SECONDS="${PROMOTE_STABLE_SECONDS:-60}"
HEARTBEAT_SECONDS="${HEARTBEAT_SECONDS:-15}"

pg_args() {
  local args=(
    -D "$PGDATA"
    -c "cluster_name=${NODE_NAME}"
    -c "listen_addresses=*"
    -c "unix_socket_directories=${SOCKET_DIR}"
    -c "max_connections=${PG_MAX_CONNECTIONS}"
    -c "shared_buffers=${PG_SHARED_BUFFERS}"
    -c "effective_cache_size=${PG_EFFECTIVE_CACHE_SIZE}"
    -c "work_mem=16MB"
    -c "maintenance_work_mem=512MB"
    -c "random_page_cost=1.1"
    -c "wal_level=replica"
    -c "wal_compression=zstd"
    -c "max_wal_size=2GB"
    -c "max_worker_processes=16"
    -c "max_logical_replication_workers=8"
    -c "max_sync_workers_per_subscription=2"
    -c "hot_standby=on"
    -c "log_line_prefix=[%m] [%p] "
  )
  if [[ "$ROLE" == "primary" ]]; then
    args+=(
      -c "archive_mode=on"
      -c "archive_command=wal-g wal-push %p"
      -c "archive_timeout=${ARCHIVE_TIMEOUT}"
      -c "restore_command=wal-g wal-fetch %f %p"
      -c "recovery_target_timeline=latest"
    )
  else
    args+=(
      -c "archive_mode=off"
      -c "restore_command=wal-g wal-fetch %f %p"
      -c "recovery_target_timeline=latest"
      -c "max_standby_archive_delay=60s"
      -c "default_transaction_read_only=on"
    )
  fi
  printf '%s\0' "${args[@]}"
}

# Prints "found" or "none". Returns 1 when the listing itself fails, so an
# unreachable bucket is never mistaken for an empty one.
backup_status() {
  local out
  if ! out="$(as_pg wal-g backup-list 2>&1)"; then
    log "wal-g backup-list failed: ${out##*$'\n'}" >&2
    return 1
  fi
  if grep -q 'base_' <<<"$out"; then
    echo found
  elif grep -q 'No backups found' <<<"$out"; then
    echo none
  else
    log "unexpected wal-g backup-list output: ${out##*$'\n'}" >&2
    return 1
  fi
}

start_health_server() {
  /opt/capgo/health_server.pl &
}

start_tunnel() {
  [[ -n "${TUNNEL_TOKEN:-}" ]] || { log "no TUNNEL_TOKEN, tunnel disabled"; return 0; }
  (
    while true; do
      cloudflared tunnel --no-autoupdate run --token "$TUNNEL_TOKEN" || true
      log "cloudflared exited, restarting in 5s"
      sleep 5
    done
  ) &
}

prepare_dirs() {
  # WAL-G prefetches into pg_wal/.wal-g by default; it must stay on the PGDATA
  # filesystem (rename into pg_wal fails across devices).
  mkdir -p "$PGDATA" "$SOCKET_DIR"
  [[ "$(id -u)" == "0" ]] && chown -R postgres:postgres "$PGDATA" "$SOCKET_DIR"
  chmod 700 "$PGDATA"
}

restore_latest_backup() {
  phase restoring
  find "$PGDATA" -mindepth 1 -delete
  as_pg wal-g backup-fetch "$PGDATA" LATEST
  # Configs inside the backup come from the primary; we always pass ours on the
  # command line, but keep hba open for local + password logins.
  write_hba
}

write_hba() {
  cat > "$PGDATA/pg_hba.conf" <<'HBA'
local   all  all                 trust
host    all  all  127.0.0.1/32   scram-sha-256
host    all  all  ::1/128        scram-sha-256
host    all  all  0.0.0.0/0      scram-sha-256
host    all  all  ::/0           scram-sha-256
HBA
  [[ "$(id -u)" == "0" ]] && chown postgres:postgres "$PGDATA/pg_hba.conf"
  return 0
}

init_fresh_cluster() {
  phase initdb
  find "$PGDATA" -mindepth 1 -delete
  as_pg initdb -D "$PGDATA" --encoding=UTF8 --locale=C.UTF-8 \
    --auth-local=trust --auth-host=scram-sha-256 --data-checksums
  write_hba
  FRESH_INIT=1
}

start_postgres() {
  local -a args
  mapfile -d '' args < <(pg_args)
  as_pg postgres "${args[@]}" &
  PG_PID=$!
  log "postgres started pid=${PG_PID}"
}

wait_for_postgres() {
  # Restores can replay a lot of WAL before accepting connections.
  until as_pg pg_isready -q -h "$SOCKET_DIR"; do
    if ! kill -0 "$PG_PID" 2>/dev/null; then
      log "postgres exited before becoming ready"
      wait "$PG_PID" || true
      exit 1
    fi
    sleep 2
  done
}

drop_stale_source_slot() {
  local slot="$1"
  psql -X "$SOURCE_CONNINFO" -v ON_ERROR_STOP=1 -At <<SQL || true
SELECT pg_drop_replication_slot(slot_name)
FROM pg_replication_slots
WHERE slot_name = '${slot}' AND NOT active;
SQL
}

bootstrap_primary() {
  : "${SOURCE_CONNINFO:?SOURCE_CONNINFO is required for a fresh primary}"
  : "${PUBLICATION_NAME:?PUBLICATION_NAME is required}"
  : "${SUBSCRIPTION_NAME:?SUBSCRIPTION_NAME is required}"
  local slot="${SUBSCRIPTION_NAME}_slot"

  phase bootstrap-schema
  psql_local <<SQL
ALTER ROLE postgres PASSWORD '${POSTGRES_PASSWORD//\'/\'\'}';
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'capgo_reader') THEN
    CREATE ROLE capgo_reader LOGIN;
  END IF;
END \$\$;
ALTER ROLE capgo_reader PASSWORD '${READER_PASSWORD//\'/\'\'}';
SQL
  psql_local -f /opt/capgo/schema.sql
  psql_local <<'SQL'
CREATE SCHEMA IF NOT EXISTS capgo_cf;
CREATE TABLE IF NOT EXISTS capgo_cf.heartbeat (id int PRIMARY KEY, at timestamptz NOT NULL);
GRANT USAGE ON SCHEMA public TO capgo_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO capgo_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO capgo_reader;
SQL

  phase bootstrap-subscribe
  drop_stale_source_slot "$slot"
  # statement_timeout=0: the initial COPY of manifest exceeds Supabase's default.
  local conninfo="${SOURCE_CONNINFO} options='-c statement_timeout=0'"
  psql_local <<SQL
CREATE SUBSCRIPTION ${SUBSCRIPTION_NAME}
CONNECTION '${conninfo//\'/\'\'}'
PUBLICATION ${PUBLICATION_NAME}
WITH (slot_name = '${slot}', copy_data = true, create_slot = true, enabled = true);
SQL

  phase bootstrap-initial-copy
  local pending
  while true; do
    pending="$(psql_local -At -c "SELECT count(*) FROM pg_subscription_rel WHERE srsubstate <> 'r'")"
    [[ "$pending" == "0" ]] && break
    log "initial copy: ${pending} table(s) not ready"
    sleep 15
  done
  psql_local -c "ANALYZE"

  phase bootstrap-first-backup
  as_pg wal-g backup-push "$PGDATA"
  log "first base backup pushed; replicas can now start"
}

# Name of the WAL segment that replay needs next after LSN $2 on timeline $1
# (16 MB segments: 256 per 4 GB "xlogid").
wal_segment_after() {
  local tli="$1" lsn="$2" hi lo seg
  hi=$((16#${lsn%/*}))
  lo=$((16#${lsn#*/}))
  seg=$((lo / 16777216))
  ((lo % 16777216 == 0)) || seg=$((seg + 1))
  if ((seg >= 256)); then
    hi=$((hi + 1))
    seg=0
  fi
  printf '%08X%08X%08X' "$tli" "$hi" "$seg"
}

# 0 = archive has no segment after the replay position (safe to promote),
# 1 = more WAL exists or the archive could not be checked.
archive_drained() {
  local lsn="$1" tli segment out rc=0
  tli="$(psql_local -At -c 'SELECT timeline_id FROM pg_control_checkpoint()')"
  segment="$(wal_segment_after "$tli" "$lsn")"
  out="$(as_pg wal-g wal-fetch "$segment" /tmp/capgo-wal-probe 2>&1)" || rc=$?
  rm -f /tmp/capgo-wal-probe
  if ((rc == 0)); then
    log "segment ${segment} is in the archive but not replayed yet; not promoting"
    return 1
  fi
  if grep -q 'does not exist' <<<"$out"; then
    return 0
  fi
  log "cannot check archive for ${segment}: ${out##*$'\n'}"
  return 1
}

# Restored primary: stay a standby until replay stops advancing AND the
# archive confirms there is no next segment. A WAL fetch outage only delays
# promotion; it never promotes over WAL that exists in R2.
promote_when_caught_up() {
  phase replaying-archive
  local last="" lsn stable=0
  while true; do
    sleep 5
    lsn="$(psql_local -At -c 'SELECT pg_last_wal_replay_lsn()')"
    if [[ "$lsn" != "$last" ]]; then
      log "replayed up to ${lsn}"
      last="$lsn"
      stable=0
      continue
    fi
    stable=$((stable + 5))
    ((stable >= PROMOTE_STABLE_SECONDS)) || continue
    if archive_drained "$lsn"; then
      break
    fi
    stable=0
  done
  log "archive drained at ${last}, promoting"
  psql_local -c 'SELECT pg_promote(true, 300)' >/dev/null
}

push_backup() {
  if as_pg wal-g backup-push "$PGDATA"; then
    as_pg wal-g delete retain FULL "$BACKUP_RETAIN_FULL" --confirm || log "backup retention failed"
  else
    log "base backup failed"
  fi
}

# Replicas use heartbeat age as their readiness/lag signal; the primary
# commits one row every HEARTBEAT_SECONDS even when Supabase is idle.
heartbeat_loop() {
  psql_local -q -c "CREATE SCHEMA IF NOT EXISTS capgo_cf; CREATE TABLE IF NOT EXISTS capgo_cf.heartbeat (id int PRIMARY KEY, at timestamptz NOT NULL)" || true
  while true; do
    psql_local -q -c "INSERT INTO capgo_cf.heartbeat VALUES (1, now()) ON CONFLICT (id) DO UPDATE SET at = excluded.at" >/dev/null 2>&1 \
      || log "heartbeat write failed"
    sleep "$HEARTBEAT_SECONDS"
  done
}

backup_loop() {
  # A promoted primary is on a new timeline: back it up right away so the next
  # restart (and new replicas) do not replay everything since the old backup.
  if [[ "$RESTORED_PRIMARY" == "1" ]]; then
    log "base backup after promotion"
    push_backup
  fi
  while true; do
    sleep $((BACKUP_INTERVAL_HOURS * 3600))
    log "scheduled base backup"
    push_backup
  done
}

shutdown() {
  log "SIGTERM received"
  phase stopping
  if [[ -n "$PG_PID" ]] && kill -0 "$PG_PID" 2>/dev/null; then
    if [[ "$ROLE" == "primary" ]] && [[ "$(psql_local -At -c 'SELECT pg_is_in_recovery()' 2>/dev/null)" == "f" ]]; then
      # Close the current segment so the archiver ships everything the
      # subscription already confirmed to Supabase before we exit.
      psql_local -c "SELECT pg_switch_wal()" >/dev/null 2>&1 || true
      psql_local -c "CHECKPOINT" >/dev/null 2>&1 || true
    fi
    as_pg pg_ctl -D "$PGDATA" stop -m fast -t 600 || true
  fi
  exit 0
}
trap shutdown TERM INT

phase booting
start_health_server
prepare_dirs

if [[ "$ROLE" == "primary" ]]; then
  if ! status="$(backup_status)"; then
    # Never initdb (and re-copy from Supabase) because R2 was unreachable.
    log "cannot list backups in ${WALG_S3_PREFIX}; refusing to start (cron will retry)"
    exit 1
  fi
  if [[ "$status" == "found" ]]; then
    restore_latest_backup
    # Restore as a standby, not with recovery.signal: a transient wal-fetch
    # failure would end recovery early and silently drop committed changes.
    # promote_when_caught_up promotes once replay stops advancing.
    as_pg touch "$PGDATA/standby.signal"
    RESTORED_PRIMARY=1
  else
    init_fresh_cluster
  fi
elif [[ "$ROLE" == "replica" ]]; then
  phase waiting-for-backup
  until status="$(backup_status)" && [[ "$status" == "found" ]]; do
    log "no base backup in ${WALG_S3_PREFIX} yet, retrying in 30s"
    sleep 30
  done
  restore_latest_backup
  as_pg touch "$PGDATA/standby.signal"
else
  log "unknown ROLE=${ROLE}"
  exit 1
fi

start_postgres
phase starting-postgres
wait_for_postgres

if [[ "$ROLE" == "primary" ]]; then
  [[ "$RESTORED_PRIMARY" == "1" ]] && promote_when_caught_up
  until [[ "$(psql_local -At -c 'SELECT pg_is_in_recovery()')" == "f" ]]; do
    sleep 2
  done
  [[ "$FRESH_INIT" == "1" ]] && bootstrap_primary
  heartbeat_loop &
  backup_loop &
fi

start_tunnel
phase running
wait "$PG_PID"
log "postgres exited"
exit 1
