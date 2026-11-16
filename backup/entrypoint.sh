#!/bin/sh
# Plan aus BACKUP_SCHEDULE übernehmen, damit er ohne Image-Build in der docker-compose.yml änderbar ist
set -eu

echo "${BACKUP_SCHEDULE} /usr/local/bin/backup.sh" > /etc/crontabs/root
echo "$(date): Backup-Plan: ${BACKUP_SCHEDULE}"

exec crond -f -l 8
