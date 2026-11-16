# n8n v3 auf Basis des offiziellen Debian-Images, erweitert um Oracle- und MS-SQL-ODBC-Treiber

# Vollständiges Tag des offiziellen Images, z. B. "3.2.2-debian"; die Pipeline ermittelt es automatisch
ARG N8N_BASE_TAG=v3-rc-debian

# Das offizielle Image hat keinen Paketmanager, daher Treiber in einer eigenen Stage mit gleicher Debian-Version vorbereiten
FROM debian:trixie-slim AS drivers

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    unzip \
    unixodbc \
    && rm -rf /var/lib/apt/lists/*

RUN curl -sSL -O https://packages.microsoft.com/config/debian/13/packages-microsoft-prod.deb && \
    dpkg -i packages-microsoft-prod.deb && \
    rm packages-microsoft-prod.deb && \
    apt-get update && \
    ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql18 && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p /tmp/oracle /opt/oracle && cd /tmp/oracle && \
    curl -sSL -O https://download.oracle.com/otn_software/linux/instantclient/2326300/instantclient-basiclite-linux.x64-23.26.3.0.0.zip && \
    curl -sSL -O https://download.oracle.com/otn_software/linux/instantclient/2326300/instantclient-odbc-linux.x64-23.26.3.0.0.zip && \
    unzip -qo instantclient-basiclite-linux.x64-23.26.3.0.0.zip && \
    unzip -qo instantclient-odbc-linux.x64-23.26.3.0.0.zip && \
    mv instantclient_23_26 /opt/oracle/ && \
    rm -rf /tmp/oracle

RUN cd /opt/oracle/instantclient_23_26 && \
    ./odbc_update_ini.sh "/" "/opt/oracle/instantclient_23_26" "Oracle" && \
    sed -i 's/\[ODBC Driver 18 for SQL Server\]/[SqlServer]/g' /etc/odbcinst.ini && \
    sed -i 's/\[Oracle ODBC Driver for Oracle/[Oracle/g' /etc/odbcinst.ini

# unixODBC-Bibliotheken sammeln, die dem offiziellen Image fehlen
RUN mkdir -p /staging/lib && \
    cp -a /usr/lib/x86_64-linux-gnu/libodbc*.so* /usr/lib/x86_64-linux-gnu/libltdl.so* /staging/lib/

# Custom Nodes aus dem Quellcode bauen; Debian- und Node-Version passend zum offiziellen Image
FROM node:26-trixie-slim AS custom-nodes

COPY nodes /build/nodes

RUN mkdir -p /opt/n8n-custom-nodes /build/packages && \
    for nodeDirectory in /build/nodes/*/; do \
        cd "$nodeDirectory" && npm ci && npm run build && npm pack --pack-destination /build/packages || exit 1; \
    done && \
    cd /opt/n8n-custom-nodes && \
    npm init -y >/dev/null && \
    npm install --omit=peer --omit=dev --no-audit --no-fund /build/packages/*.tgz

FROM n8nio/n8n:${N8N_BASE_TAG}

ENV N8N_EDITOR_MODE=viewonly \
    N8N_CUSTOM_EXTENSIONS=/opt/n8n-custom-nodes \
    N8N_RUNNERS_TASK_TIMEOUT=300 \
    N8N_UNVERIFIED_PACKAGES_ENABLED=true

COPY --from=custom-nodes /opt/n8n-custom-nodes /opt/n8n-custom-nodes
COPY migration/migrate-custom-node-types.js /opt/n8n-migration/

COPY --from=drivers /staging/lib/ /usr/lib/x86_64-linux-gnu/
COPY --from=drivers /opt/microsoft /opt/microsoft
COPY --from=drivers /opt/oracle /opt/oracle
COPY --from=drivers /etc/odbcinst.ini /etc/odbc.ini /etc/

# n8n entpackt Community-Pakete mit "tar -xz"; dem offiziellen Image fehlt gzip
COPY --from=drivers /usr/bin/gzip /usr/bin/gzip

ENV LD_LIBRARY_PATH=/opt/oracle/instantclient_23_26 \
    ORACLE_HOME=/opt/oracle/instantclient_23_26 \
    TNS_ADMIN=/opt/oracle/instantclient_23_26 \
    ODBCSYSINI=/etc \
    ODBCINI=/etc/odbc.ini

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5678/healthz', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1
