#!/usr/bin/env bash
# Local end-to-end test of the container image, no Cloudflare involved:
# adobe/s3mock stands in for R2, a postgres:17 container stands in for Supabase.
#   1. fresh primary: schema + subscription + initial copy + first base backup
#   2. replica restores from the bucket and replays archived WAL
#   3. new source rows reach the replica through primary -> WAL archive -> replica
#   4. primary SIGTERM + restart restores from the bucket and resumes the subscription
# Usage: bash read_replicate/cf_container/smoke_test.sh   (KEEP=1 keeps containers)
set -Eeuo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE=capgo-pgnode:smoke
NET=pgcf-smoke
PREFIX=pgcf-smoke
PW=smoke-pass

cleanup() {
  [[ "${KEEP:-0}" == "1" ]] && return
  docker rm -f "${PREFIX}-s3" "${PREFIX}-source" "${PREFIX}-primary" "${PREFIX}-replica" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT

step() { echo; echo "=== $*"; }
src_sql() { docker exec -i "${PREFIX}-source" psql -X -U postgres -At -v ON_ERROR_STOP=1 "$@"; }
node_sql() { local node="$1"; shift; docker exec -i "${PREFIX}-${node}" psql -X -h /var/run/postgresql -U postgres -At "$@"; }
health() { docker exec "${PREFIX}-$1" /opt/capgo/health.sh; }
wait_for() {
  local desc="$1" timeout="$2"; shift 2
  local deadline=$((SECONDS + timeout))
  until "$@" >/dev/null 2>&1; do
    if ((SECONDS > deadline)); then
      echo "TIMEOUT waiting for: $desc"
      for n in primary replica; do docker logs --tail 40 "${PREFIX}-$n" 2>&1 | sed "s/^/[$n] /" || true; done
      exit 1
    fi
    sleep 3
  done
  echo "ok: $desc"
}
phase_is() { [[ "$(docker exec "${PREFIX}-$1" cat /tmp/capgo-phase 2>/dev/null)" == "$2" ]]; }
count_is() { [[ "$(node_sql "$1" -c 'SELECT count(*) FROM public.notifications' 2>/dev/null)" == "$2" ]]; }

cleanup
cp "$DIR/../schema_replicate.sql" "$DIR/container/schema.sql"

step "build image"
docker build -q -t "$IMAGE" "$DIR" >/dev/null
docker network create "$NET" >/dev/null

step "start S3 mock (R2 stand-in) + fake Supabase source"
docker run -d --name "${PREFIX}-s3" --network "$NET" -e COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS=wal -e initialBuckets=wal \
  adobe/s3mock >/dev/null
docker run -d --name "${PREFIX}-source" --network "$NET" -e POSTGRES_PASSWORD="$PW" \
  postgres:17-bookworm -c wal_level=logical -c max_replication_slots=10 -c max_wal_senders=10 >/dev/null
wait_for "source up" 60 src_sql -c 'SELECT 1'

src_sql -q < "$DIR/../schema_replicate.sql"
src_sql -q -c "CREATE PUBLICATION smoke_pub FOR TABLE public.orgs, public.stripe_info, public.org_users, public.apps, public.app_versions, public.channels, public.channel_devices, public.manifest, public.notifications, public.onboarding_demo_data"
src_sql -q -c "INSERT INTO public.notifications (owner_org, event, uniq_id) SELECT gen_random_uuid(), 'seed', g::text FROM generate_series(1, 1000) g"

node_env=(
  -e WALG_S3_PREFIX=s3://wal/smoke
  -e AWS_ENDPOINT="http://${PREFIX}-s3:9090"
  -e AWS_ACCESS_KEY_ID=smoke -e AWS_SECRET_ACCESS_KEY=smoke-secret
  -e POSTGRES_PASSWORD="$PW" -e READER_PASSWORD=reader-pass
  -e ARCHIVE_TIMEOUT=10
  -e PG_SHARED_BUFFERS=128MB -e PG_EFFECTIVE_CACHE_SIZE=512MB
)
start_primary() {
  docker run -d --name "${PREFIX}-primary" --network "$NET" "${node_env[@]}" \
    -e ROLE=primary -e NODE_NAME=primary \
    -e SOURCE_CONNINFO="host=${PREFIX}-source port=5432 dbname=postgres user=postgres password=${PW} sslmode=disable" \
    -e PUBLICATION_NAME=smoke_pub -e SUBSCRIPTION_NAME=smoke_sub \
    "$IMAGE" >/dev/null
}

step "1. fresh primary"
start_primary
wait_for "primary bootstrapped (phase=running)" 600 phase_is primary running
wait_for "primary copied 1000 seed rows" 30 count_is primary 1000
health primary

step "2. replica restores from bucket"
docker run -d --name "${PREFIX}-replica" --network "$NET" "${node_env[@]}" \
  -e ROLE=replica -e NODE_NAME=replica "$IMAGE" >/dev/null
wait_for "replica running" 600 phase_is replica running
wait_for "replica has 1000 rows" 120 count_is replica 1000
[[ "$(node_sql replica -c 'SELECT pg_is_in_recovery()')" == "t" ]] || { echo "replica not in recovery"; exit 1; }
echo "ok: replica is a hot standby"

step "3. live change: source -> primary -> WAL archive -> replica"
src_sql -q -c "INSERT INTO public.notifications (owner_org, event, uniq_id) SELECT gen_random_uuid(), 'live', g::text FROM generate_series(1, 500) g"
wait_for "primary has 1500 rows" 60 count_is primary 1500
wait_for "replica has 1500 rows (via R2 archive)" 120 count_is replica 1500
health replica

step "4. primary SIGTERM + restart restores from bucket and resumes"
docker stop -t 120 "${PREFIX}-primary" >/dev/null
docker rm "${PREFIX}-primary" >/dev/null
src_sql -q -c "INSERT INTO public.notifications (owner_org, event, uniq_id) SELECT gen_random_uuid(), 'while-down', g::text FROM generate_series(1, 250) g"
start_primary
wait_for "restored primary running" 600 phase_is primary running
wait_for "restored primary caught up 1750 rows" 120 count_is primary 1750
wait_for "replica follows new timeline to 1750 rows" 180 count_is replica 1750
health primary
health replica

echo
echo "SMOKE TEST PASSED"
