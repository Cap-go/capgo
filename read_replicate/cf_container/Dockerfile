# Postgres 17 node for Cloudflare Containers.
# One image for both roles: ROLE=primary (Supabase logical subscriber, archives
# WAL to R2) and ROLE=replica (restores the latest base backup from R2 and
# replays archived WAL forever as a hot standby).
# Cloudflare builds linux/amd64; arm64 is only for the local smoke test.
# Bumping a version requires updating the matching --checksum digests below.
ARG WALG_VERSION=v3.0.9
ARG CLOUDFLARED_VERSION=2026.10.1

FROM scratch AS bins-amd64
ARG WALG_VERSION
ARG CLOUDFLARED_VERSION
ADD --checksum=sha256:d6795c663894d836ba20840bffe8970aed81bbe25d3151bd4951f6f9c362def9 https://github.com/wal-g/wal-g/releases/download/${WALG_VERSION}/wal-g-pg-22.04-amd64 /wal-g
ADD --checksum=sha256:3bfc539f45d2620c71debb7a86be0efa737ed5ccbad9eb85c787116900e5c586 https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-amd64 /cloudflared

FROM scratch AS bins-arm64
ARG WALG_VERSION
ARG CLOUDFLARED_VERSION
ADD --checksum=sha256:072eb4a4a119f817e1fa888c64a776b01e3453b2e0d967a67d149adb18fde652 https://github.com/wal-g/wal-g/releases/download/${WALG_VERSION}/wal-g-pg-22.04-aarch64 /wal-g
ADD --checksum=sha256:2c65dfabf616c40efc7545d107d7a57ad5e21377e2964b7e88af19a238074a46 https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-arm64 /cloudflared

ARG TARGETARCH
FROM bins-${TARGETARCH} AS bins

# No apt and no RUN steps: static binaries + scripts only.
FROM postgres:17-bookworm
COPY --from=bins --chmod=755 /wal-g /cloudflared /usr/local/bin/
# schema.sql is copied from ../schema_replicate.sql by the deploy scripts.
COPY container/schema.sql /opt/capgo/schema.sql
COPY --chmod=755 container/entrypoint.sh container/health.sh container/health_server.pl /opt/capgo/

# Postgres, WAL-G, cloudflared and the health server all run unprivileged.
USER postgres
EXPOSE 8080
ENTRYPOINT ["/opt/capgo/entrypoint.sh"]
