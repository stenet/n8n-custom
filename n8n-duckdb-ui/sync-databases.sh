#!/bin/sh
# Gleicht die eingebundenen Datenbanken regelmäßig mit dem Quack-Verzeichnis von n8n ab:
# bindet neue ein, verbindet nach einem n8n-Neustart (neue Generation) alle neu und bindet eine
# Datenbank neu ein, wenn sich ihr Katalog geändert hat
set -u

: "${SYNC_INTERVAL:=30}"

escapedToken=$(printf "%s" "$QUACK_TOKEN" | sed "s/'/''/g")
directoryUri="quack:${QUACK_HOST}:${QUACK_PORT}"
attachedState=/tmp/attached-databases
touch "$attachedState"

sendToUi() {
  printf "%s\n" "$1" > /tmp/duckdb-stdin
}

isAttached() {
  # Die UI weist Abfragen ohne Origin bzw. mit fremdem Host oder Origin mit 401 ab
  responseHeader=$(curl -sf -X POST "http://localhost:4213/ddb/run" \
    -H "Origin: http://localhost:4213" \
    -H "X-DuckDB-UI-Connection-Name: sync" \
    --data "USE ${1}; SELECT 1" | head -c 3 | od -An -tu1 | tr -s " ") || return 1

  # Auch Fehler kommen mit Status 200; das Erfolgs-Flag steht im dritten Byte der Binärantwort
  # (nachgeprüft: "d \0 \1" bei Erfolg, "d \0 \0" bei Fehler)
  [ "$responseHeader" = " 100 0 1" ]
}

listDatabases() {
  duckdb :memory: -csv -noheader -c \
    "SELECT name, port, generation FROM quack_query('${directoryUri}', 'SELECT name, port, generation FROM databases', token = '${escapedToken}', disable_ssl = true)"
}

# Die UI sieht nur den Katalog vom Zeitpunkt des ATTACH; später in n8n angelegte Tabellen,
# Spalten oder Macros fehlen bis zum erneuten Einbinden (nachgeprüft)
catalogFingerprint() {
  duckdb :memory: -csv -noheader -c \
    "SELECT * FROM quack_query('quack:${QUACK_HOST}:${1}', 'SELECT md5(string_agg(entry, chr(10) ORDER BY entry)) FROM (
      SELECT schema_name || ''.'' || table_name || ''.'' || column_name || '' '' || data_type AS entry
      FROM duckdb_columns() WHERE database_name = current_database()
      UNION ALL
      SELECT schema_name || ''.'' || function_name || '' '' || function_type
      FROM duckdb_functions() WHERE database_name = current_database() AND NOT internal)',
      token = '${escapedToken}', disable_ssl = true)"
}

attach() {
  echo "Binde ${1} (Port ${2}) ein"
  sendToUi "DETACH DATABASE IF EXISTS ${1};"
  sendToUi "ATTACH 'quack:${QUACK_HOST}:${2}' AS ${1} (TOKEN '${escapedToken}', DISABLE_SSL true);"
  grep -v "^${1} " "$attachedState" > "${attachedState}.new"
  echo "${1} ${2} ${3} ${4}" >> "${attachedState}.new"
  mv "${attachedState}.new" "$attachedState"
}

syncOnce() {
  databases=$(listDatabases 2>/dev/null) || { echo "Quack-Verzeichnis ${directoryUri} nicht erreichbar"; return; }

  printf "%s\n" "$databases" | while IFS=, read -r name port generation; do
    # Namen und Ports stammen aus n8n, werden aber in SQL eingesetzt
    printf "%s" "$name" | grep -Eq '^[a-z_][a-z0-9_]*$' || continue
    printf "%s" "$port" | grep -Eq '^[0-9]+$' || continue

    # Ist der Katalog gerade nicht abrufbar, gilt der bekannte Stand, damit nicht ständig neu eingebunden wird
    knownFingerprint=$(awk -v name="$name" '$1 == name { print $4 }' "$attachedState")
    fingerprint=$(catalogFingerprint "$port" 2>/dev/null) || fingerprint=$knownFingerprint

    if ! grep -qx "${name} ${port} ${generation} ${fingerprint}" "$attachedState" || ! isAttached "$name"; then
      attach "$name" "$port" "$generation" "$fingerprint"
    fi
  done
}

# Warten, bis die UI läuft, da der Abgleich über sie prüft, welche Datenbanken eingebunden sind
until curl -sf -o /dev/null "http://localhost:4213/"; do
  sleep 1
done

while true; do
  syncOnce
  sleep "$SYNC_INTERVAL"
done
