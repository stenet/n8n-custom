# Backup-Service für die n8n-SQLite-Datenbank (läuft als eigener Service neben n8n)
FROM alpine:3.24.4

RUN apk add --no-cache sqlite tzdata

COPY backup.sh /usr/local/bin/backup.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/entrypoint.sh

ENV BACKUP_SCHEDULE="0 2,14 * * *" \
    BACKUP_KEEP=10 \
    N8N_DATA_DIR=/n8n-data \
    BACKUP_DIR=/backups

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
