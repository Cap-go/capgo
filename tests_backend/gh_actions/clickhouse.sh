docker run -d \
    -v $(realpath ./ch_data):/var/lib/clickhouse/ \
    -v $(realpath ./ch_logs):/var/log/clickhouse-server/ \
    -p 18123:8123 \
    -p 19000:9000 \
    -p 9440:9440 \
    -p 8123:8123 \
    -p 9500:9000 \
    --name some-clickhouse-server --ulimit nofile=262144:262144 clickhouse/clickhouse-server