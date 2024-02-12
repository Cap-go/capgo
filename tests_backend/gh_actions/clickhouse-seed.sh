#!/bin/bash

echo "ClickHouse seed."

docker exec some-clickhouse-server clickhouse-client -q --multiquery "$(cat ./../../supabase/clickhouse-seed.sql)"

echo "Minio is seeded."
