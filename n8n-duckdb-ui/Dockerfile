# DuckDB-Web-UI für die DuckDB-Datenbank von n8n, angebunden über Quack
FROM debian:trixie-slim

ARG TARGETARCH
ARG DUCKDB_VERSION=2.0.0

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    nginx \
    && rm -rf /var/lib/apt/lists/*

RUN curl -sSL "https://github.com/duckdb/duckdb/releases/download/v${DUCKDB_VERSION}/duckdb-cli-linux-${TARGETARCH}.tar.gz" \
    | tar -xz -C /usr/local/bin duckdb

# UID 1001 entspricht dem Benutzer "tip" auf dem Docker-Host, dem das Notebook-Verzeichnis gehört
RUN useradd --uid 1001 --create-home duckdb

COPY nginx.conf /etc/n8n-duckdb-ui/nginx.conf
COPY entrypoint.sh sync-databases.sh healthcheck.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/sync-databases.sh /usr/local/bin/healthcheck.sh

USER duckdb

# Erweiterungen vorab installieren, damit der Start nicht vom Download abhängt
RUN duckdb :memory: -c "INSTALL ui; INSTALL quack;" && \
    mkdir -p /home/duckdb/.duckdb/extension_data

ENV QUACK_HOST=n8n \
    QUACK_PORT=9494

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD /usr/local/bin/healthcheck.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
