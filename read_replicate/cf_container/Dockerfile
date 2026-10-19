# Postgres 17 node for Cloudflare Containers.
# One image for both roles: ROLE=primary (Supabase logical subscriber, archives
# WAL to R2) and ROLE=replica (restores the latest base backup from R2 and
# replays archived WAL forever as a hot standby).
# Cloudflare builds linux/amd64; arm64 is only for the local smoke test.
ARG WALG_VERSION=v3.0.9
ARG CLOUDFLARED_VERSION=2026.10.1

FROM scratch AS bins-amd64
ARG WALG_VERSION
ARG CLOUDFLARED_VERSION
ADD https://github.com/wal-g/wal-g/releases/download/${WALG_VERSION}/wal-g-pg-22.04-amd64 /wal-g
ADD https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-amd64 /cloudflared

FROM scratch AS bins-arm64
ARG WALG_VERSION
ARG CLOUDFLARED_VERSION
ADD https://github.com/wal-g/wal-g/releases/download/${WALG_VERSION}/wal-g-pg-22.04-aarch64 /wal-g
ADD https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-arm64 /cloudflared

ARG TARGETARCH
FROM bins-${TARGETARCH} AS bins

# No apt and no RUN steps: static binaries + scripts only.
FROM postgres:17-bookworm
COPY --from=bins --chmod=755 /wal-g /cloudflared /usr/local/bin/
# schema.sql is copied from ../schema_replicate.sql by the deploy scripts.
COPY container/schema.sql /opt/capgo/schema.sql
COPY --chmod=755 container/entrypoint.sh container/health.sh container/health_server.pl /opt/capgo/

EXPOSE 8080
ENTRYPOINT ["/opt/capgo/entrypoint.sh"]
