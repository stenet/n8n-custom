#!/bin/bash
# Interaktive Migration einer n8n-2.x-Installation auf das v3-Image mit eingebauten Custom Nodes.
# Unterstützt SQLite und Postgres sowie Swarm-Services und einzelne Container (z. B. docker compose).
# Ausführung auf dem Docker-Host, auf dem der n8n-Container läuft.
set -euo pipefail

DEFAULT_NEW_IMAGE="tipcloud.azurecr.io/n8n:3"
N8N_DATA_PATH="/home/node/.n8n"
ENV_FILE=$(mktemp)
trap 'rm -f "$ENV_FILE"' EXIT

info() { echo -e "\033[1;34m==>\033[0m $*"; }
warn() { echo -e "\033[1;33m!!\033[0m $*"; }
fail() { echo -e "\033[1;31mFEHLER:\033[0m $*" >&2; exit 1; }

confirm() {
  local answer
  read -r -p "$1 [j/N] " answer
  [[ "$answer" =~ ^[jJyY]$ ]]
}

ask() {
  local answer
  read -r -p "$1 [$2] " answer
  echo "${answer:-$2}"
}

select_container() {
  mapfile -t containers < <(docker ps --format '{{.ID}}\t{{.Names}}\t{{.Image}}' | grep -i 'n8n' | grep -iv 'backup' || true)
  [ ${#containers[@]} -gt 0 ] || fail "Kein laufender n8n-Container gefunden."
  info "Gefundene n8n-Container:"
  for index in "${!containers[@]}"; do
    printf "  %d) %s\n" "$((index + 1))" "$(echo "${containers[$index]}" | tr '\t' ' ')"
  done
  local choice
  read -r -p "Welcher Container soll migriert werden? [1] " choice
  choice=${choice:-1}
  [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#containers[@]} ] || fail "Ungültige Auswahl."
  CONTAINER_ID=$(echo "${containers[$((choice - 1))]}" | cut -f1)
}

inspect_container() {
  CONTAINER_NAME=$(docker inspect -f '{{.Name}}' "$CONTAINER_ID" | sed 's#^/##')
  OLD_IMAGE=$(docker inspect -f '{{.Config.Image}}' "$CONTAINER_ID")
  SWARM_SERVICE=$(docker inspect -f '{{index .Config.Labels "com.docker.swarm.service.name"}}' "$CONTAINER_ID")
  DATA_SOURCE=$(docker inspect -f "{{range .Mounts}}{{if eq .Destination \"$N8N_DATA_PATH\"}}{{if .Name}}{{.Name}}{{else}}{{.Source}}{{end}}{{end}}{{end}}" "$CONTAINER_ID")
  NETWORK=$(docker inspect -f '{{range $name, $settings := .NetworkSettings.Networks}}{{$name}} {{end}}' "$CONTAINER_ID" | awk '{print $1}')
  # Nur n8n-Einstellungen übernehmen, nicht die Laufzeitumgebung des alten Images
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$CONTAINER_ID" \
    | grep -E '^(DB_|N8N_|GENERIC_TIMEZONE=|TZ=)' > "$ENV_FILE" || true
  DB_TYPE=$(grep '^DB_TYPE=' "$ENV_FILE" | cut -d= -f2- || true)
  DB_TYPE=${DB_TYPE:-sqlite}
  [ -n "$DATA_SOURCE" ] || fail "Kein Volume für $N8N_DATA_PATH gefunden."
}

show_summary() {
  info "Zusammenfassung:"
  echo "  Container:      $CONTAINER_NAME ($CONTAINER_ID)"
  echo "  Swarm-Service:  ${SWARM_SERVICE:-– (einzelner Container)}"
  echo "  Altes Image:    $OLD_IMAGE"
  echo "  Neues Image:    $NEW_IMAGE"
  echo "  Datenbank:      $DB_TYPE"
  echo "  Daten:          $DATA_SOURCE -> $N8N_DATA_PATH"
  echo "  Netzwerk:       ${NETWORK:-–}"
  if grep -q '_FILE=' "$ENV_FILE"; then
    warn "Es werden *_FILE-Variablen (Docker Secrets) verwendet. Diese stehen im Migrations-Container nicht zur Verfügung."
  fi
}

ensure_backup() {
  if [ "$DB_TYPE" = "sqlite" ]; then
    info "Nach dem Stoppen wird automatisch eine Kopie der SQLite-Datenbank angelegt."
  else
    warn "Für Postgres legt dieses Skript keine Sicherung an."
    confirm "Gibt es eine aktuelle Sicherung der Postgres-Datenbank (pg_dump)?" || fail "Bitte zuerst sichern."
  fi
}

stop_n8n() {
  if [ -n "$SWARM_SERVICE" ]; then
    info "Skaliere Swarm-Service $SWARM_SERVICE auf 0 ..."
    docker service scale "$SWARM_SERVICE=0" >/dev/null
  else
    info "Stoppe Container $CONTAINER_NAME ..."
    docker stop "$CONTAINER_NAME" >/dev/null
  fi
  while docker ps -q --no-trunc | grep -q "$CONTAINER_ID"; do sleep 2; done
}

backup_sqlite() {
  [ "$DB_TYPE" = "sqlite" ] || return 0
  local backup_name="database_vor-v3_$(date +%Y-%m-%d_%H%M).sqlite"
  info "Sichere SQLite-Datenbank nach $N8N_DATA_PATH/$backup_name ..."
  run_with_new_image --entrypoint sh "$NEW_IMAGE" -c "cp $N8N_DATA_PATH/database.sqlite $N8N_DATA_PATH/$backup_name"
}

run_with_new_image() {
  local network_options=()
  [ -n "$NETWORK" ] && [ "$DB_TYPE" != "sqlite" ] && network_options=(--network "$NETWORK")
  docker run --rm --env-file "$ENV_FILE" "${network_options[@]}" -v "$DATA_SOURCE:$N8N_DATA_PATH" "$@"
}

migrate() {
  info "Stelle Node-Typen auf die eingebauten Custom Nodes um ..."
  run_with_new_image --entrypoint node "$NEW_IMAGE" /opt/n8n-migration/migrate-custom-node-types.js

  info "Entferne die über die Oberfläche installierten Community-Pakete, die jetzt eingebaut sind ..."
  for package_name in $(run_with_new_image --entrypoint node "$NEW_IMAGE" -e \
    "const p=require('/opt/n8n-custom-nodes/package.json');console.log(Object.keys(p.dependencies||{}).join(' '))"); do
    run_with_new_image "$NEW_IMAGE" community-node --uninstall --package "$package_name" 2>&1 \
      | grep -E 'uninstalled|not found' || true
  done
}

print_next_steps() {
  info "Migration abgeschlossen. n8n ist noch gestoppt."
  echo
  echo "Nächste Schritte:"
  if [ -n "$SWARM_SERVICE" ]; then
    echo "  1. In der docker-compose.yml das Image auf $NEW_IMAGE ändern (und ggf. den Backup-Service ergänzen)"
    echo "  2. docker stack deploy -c docker-compose.yml <stack-name>"
  else
    echo "  1. In der docker-compose.yml das Image auf $NEW_IMAGE ändern"
    echo "  2. docker compose up -d"
  fi
  echo "  3. Logs prüfen und kontrollieren, ob alle veröffentlichten Workflows aktiv sind"
  echo
  echo "Rückweg: Sicherung zurückspielen und wieder mit $OLD_IMAGE starten."
}

main() {
  command -v docker >/dev/null || fail "docker nicht gefunden."
  select_container
  inspect_container
  NEW_IMAGE=$(ask "Neues Image" "$DEFAULT_NEW_IMAGE")
  show_summary
  confirm "Migration mit diesen Einstellungen starten? n8n wird dabei gestoppt." || fail "Abgebrochen."
  ensure_backup
  info "Lade $NEW_IMAGE ..."
  docker pull -q "$NEW_IMAGE" >/dev/null 2>&1 || warn "Pull fehlgeschlagen, verwende lokales Image."
  stop_n8n
  backup_sqlite
  migrate
  print_next_steps
}

main "$@"
