# n8n Dockerfile auf Debian-Basis mit DuckDB-Support (Optimiert)

# Oracle Download Stage - separater Stage für Downloads
FROM debian:bookworm-slim AS oracle-downloader

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Download und entpacke Oracle Instant Client
RUN mkdir -p /tmp/oracle-basic /tmp/oracle-odbc && \
    cd /tmp/oracle-basic && \
    wget https://download.oracle.com/otn_software/linux/instantclient/2390000/instantclient-basiclite-linux.x64-23.9.0.25.07.zip && \
    unzip -q instantclient-basiclite-linux.x64-23.9.0.25.07.zip && \
    cd /tmp/oracle-odbc && \
    wget https://download.oracle.com/otn_software/linux/instantclient/2390000/instantclient-odbc-linux.x64-23.9.0.25.07.zip && \
    unzip -q instantclient-odbc-linux.x64-23.9.0.25.07.zip && \
    mkdir -p /opt/oracle && \
    cp -r /tmp/oracle-basic/instantclient_23_9 /opt/oracle/ && \
    cp -r /tmp/oracle-odbc/instantclient_23_9/* /opt/oracle/instantclient_23_9/

# Final Stage - Runtime Image
FROM node:22-bookworm-slim

# Setze Umgebungsvariablen
ENV NODE_ENV=production \
    N8N_DEPLOYMENT_TYPE=docker \
    N8N_EDITOR_MODE=viewonly

WORKDIR /home/node/app

# Installiere alle System-Dependencies in einem kombinierten Layer
# Inkl. Build-Tools für native Module (DuckDB, Custom Nodes)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    gcc \
    sqlite3 \
    ca-certificates \
    unixodbc \
    unixodbc-dev \
    curl \
    apt-transport-https \
    gnupg \
    libaio1 \
    && rm -rf /var/lib/apt/lists/*

# Installiere Microsoft SQL Server ODBC Driver
RUN curl -sSL -O https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb && \
    dpkg -i packages-microsoft-prod.deb && \
    rm packages-microsoft-prod.deb && \
    apt-get update && \
    ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql18 && \
    rm -rf /var/lib/apt/lists/*

# Kopiere Oracle Instant Client aus dem Download-Stage
COPY --from=oracle-downloader /opt/oracle/instantclient_23_9 /opt/oracle/instantclient_23_9

# Konfiguriere Oracle ODBC und ldconfig
RUN cd /opt/oracle/instantclient_23_9 && \
    ./odbc_update_ini.sh "/" "/opt/oracle/instantclient_23_9" "Oracle" && \
    echo "/opt/oracle/instantclient_23_9" > /etc/ld.so.conf.d/oracle-instantclient.conf && \
    ldconfig

# Konfiguriere ODBC Treiber (benenne SQL Server um und benenne Oracle um)
RUN sed -i 's/\[ODBC Driver 18 for SQL Server\]/[SqlServer]/g' /etc/odbcinst.ini && \
    sed -i 's/\[Oracle ODBC Driver for Oracle/[Oracle/g' /etc/odbcinst.ini

# Setze Umgebungsvariablen für Oracle Instant Client und ODBC/nanodbc
ENV LD_LIBRARY_PATH=/opt/oracle/instantclient_23_9:$LD_LIBRARY_PATH \
    ORACLE_HOME=/opt/oracle/instantclient_23_9 \
    ORACLE_BASE=/opt/oracle/instantclient_23_9 \
    TNS_ADMIN=/opt/oracle/instantclient_23_9 \
    ODBCSYSINI=/etc \
    ODBCINI=/etc/odbc.ini

# Build-Args zur Cache-Invalidierung und Cache-Clean
ARG NPM_LAYER_SALT=""
ARG NO_NPM_CACHE="true"

# Installiere n8n; Salt sorgt dafür, dass der Layer neu gebaut wird; optional Cache clean
RUN echo "salt=${NPM_LAYER_SALT}" >/dev/null && \
    if [ "${NO_NPM_CACHE}" = "true" ]; then npm cache clean --force; fi && \
    npm install -g n8n@latest

# Erstelle Verzeichnisse für Daten und Custom Nodes
RUN mkdir -p /home/node/.n8n/nodes && \
    chown -R node:node /home/node

USER node

# Exponiere Port
EXPOSE 5678

# Health-Check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5678/healthz', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

CMD ["n8n", "start"]
