#!/bin/sh
set -eu

: "${QUACK_TOKEN:?QUACK_TOKEN muss gesetzt sein}"

echo "CALL start_ui_server();" > /tmp/init.sql

nginx -c /etc/n8n-duckdb-ui/nginx.conf

# Die DuckDB-CLI beendet sich am Ende der Eingabe; eine nie geschlossene FIFO hält sie am Laufen
# und erlaubt dem Abgleich, später ATTACH-Befehle in dieselbe Instanz zu schicken
mkfifo /tmp/duckdb-stdin
sleep infinity > /tmp/duckdb-stdin &

/usr/local/bin/sync-databases.sh &

exec duckdb -init /tmp/init.sql :memory: < /tmp/duckdb-stdin
