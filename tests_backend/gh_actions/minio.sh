#!/bin/bash

# Create a directory to store the Minio data

if [ ! -d "/tmp/minio-data" ]; then
    mkdir /tmp/minio-data
    echo "Directory '/tmp/minio-data' created."
else
    echo "Directory '/tmp/minio-data' already exists."
fi

# Start the Minio container
docker run -d \
   --restart unless-stopped \
   -p 9000:9000 \
   -p 9090:9090 \
   --user $(id -u):$(id -g) \
   --name minio1 \
   -e "MINIO_ROOT_USER=ROOTUSER" \
   -e "MINIO_ROOT_PASSWORD=CHANGEME123" \
   -v /tmp/minio-data:/data \
   quay.io/minio/minio server /data --console-address ":9090"

# Function to check if MinIO is ready
check_minio_ready() {
    # Replace localhost with the actual host if needed
    local http_status=$(curl -I -s -o /dev/null -w "%{http_code}" http://localhost:9000/minio/health/live)
    if [ "$http_status" -eq 200 ]; then
        return 0
    else
        return 1
    fi
}

# Wait for MinIO to be ready
echo "Waiting for MinIO to be ready..."
while ! check_minio_ready; do
    echo "MinIO is not ready yet. Retrying in 1 seconds..."
    sleep 1
done

echo "MinIO is ready."
