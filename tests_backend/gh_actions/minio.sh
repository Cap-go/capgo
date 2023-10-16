mkdir -p /tmp/minio-data && docker run -d \
   -p 9000:9000 \
   -p 9090:9090 \
   --user $(id -u):$(id -g) \
   --name minio1 \
   -e "MINIO_ROOT_USER=ROOTUSER" \
   -e "MINIO_ROOT_PASSWORD=CHANGEME123" \
   -v /tmp/minio-data:/data \
   quay.io/minio/minio server /data --console-address ":9090" &&
   docker run --net=host --entrypoint='/bin/sh' minio/mc -c '/usr/bin/mc alias set minio http://localhost:9000 ROOTUSER CHANGEME123 && /usr/bin/mc mb minio/capgo'
