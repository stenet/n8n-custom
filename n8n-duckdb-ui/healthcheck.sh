#!/bin/sh
# Prüft nur die UI selbst; die Verbindungen zu n8n stellt sync-databases.sh bei Bedarf wieder her
curl -sf -o /dev/null http://localhost:8080/ || exit 1
