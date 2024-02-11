#!/bin/bash

# Create a directory to store the Clickhouse data if it doesn't exist
if [ ! -d "/tmp/ch_data" ]; then
    mkdir /tmp/ch_data
    echo "Directory '/tmp/ch_data' created."
else
    echo "Directory '/tmp/ch_data' already exists."
fi

# Create a directory to store the Clickhouse logs if it doesn't exist
if [ ! -d "/tmp/ch_logs" ]; then
    mkdir /tmp/ch_logs
    echo "Directory '/tmp/ch_logs' created."
else
    echo "Directory '/tmp/ch_logs' already exists."
fi

# Start the ClickHouse container
docker run -d \
    -v /tmp/ch_data:/var/lib/clickhouse/ \
    -v /tmp/ch_logs:/var/log/clickhouse-server/ \
    -p 18123:8123 \
    -p 19000:9000 \
    -p 9440:9440 \
    -p 8123:8123 \
    -p 9500:9000 \
    --name some-clickhouse-server --ulimit nofile=262144:262144 clickhouse/clickhouse-server

# Function to check if ClickHouse is ready
check_clickhouse_ready() {
    # Replace localhost with the actual host if needed
    curl -s "http://localhost:18123/ping" | grep -q "Ok."
    return $?
}

# Wait for ClickHouse to be ready
echo "Waiting for ClickHouse to be ready..."
while ! check_clickhouse_ready; do
    echo "ClickHouse is not ready yet. Retrying in 1 seconds..."
    sleep 1
done

echo "ClickHouse is ready."

docker exec some-clickhouse-server clickhouse-client -q --multiquery "$(cat ./../../supabase/clickhouse.sql)"
