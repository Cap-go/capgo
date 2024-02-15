#!/bin/bash

echo "MinIO seed"

docker run --net=host --entrypoint='/bin/sh' minio/mc -c '/usr/bin/mc alias set minio http://localhost:9000 ROOTUSER CHANGEME123 && /usr/bin/mc ls minio && /usr/bin/mc rb --force minio/capgo || true && /usr/bin/mc mb minio/capgo'

echo "Minio is seeded."

