#!/bin/sh
# Sichert die n8n-SQLite-Datenbank samt Config (Encryption Key) und behält die letzten BACKUP_KEEP Sicherungen
set -u

N8N_DATA_DIR="${N8N_DATA_DIR:-/n8n-data}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-10}"
TIMESTAMP=$(date +%Y-%m-%d_%H%M)
LOG_FILE="$BACKUP_DIR/backup.log"

log() {
  echo "$(date): $1" | tee -a "$LOG_FILE"
}

keep_newest() {
  ls -t "$BACKUP_DIR"/$1 2>/dev/null | tail -n +$((BACKUP_KEEP + 1)) | xargs -r rm
}

mkdir -p "$BACKUP_DIR"

# .backup nutzt die Online-Backup-API von SQLite und liefert auch bei laufendem n8n eine konsistente Kopie
if ! sqlite3 "$N8N_DATA_DIR/database.sqlite" ".backup '$BACKUP_DIR/database_$TIMESTAMP.sqlite'"; then
  log "FEHLER - SQLite Backup fehlgeschlagen!"
  exit 1
fi

cp "$N8N_DATA_DIR/config" "$BACKUP_DIR/config_$TIMESTAMP" 2>/dev/null
cp "$N8N_DATA_DIR/.n8n-encryption-key" "$BACKUP_DIR/encryption-key_$TIMESTAMP" 2>/dev/null

keep_newest 'database_*.sqlite'
keep_newest 'config_*'
keep_newest 'encryption-key_*'

log "n8n Backup OK"
