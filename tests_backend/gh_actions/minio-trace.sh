#!/bin/bash

echo "MinIO trace"

docker run --net=host --entrypoint='/bin/sh' minio/mc -c '/usr/bin/mc alias set minio http://localhost:9000 ROOTUSER CHANGEME123 && /usr/bin/mc admin trace --all --verbose minio'

