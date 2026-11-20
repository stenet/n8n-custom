import { existsSync } from "fs";
import { isAbsolute } from "path";
import { LoggerProxy } from "n8n-workflow";
import { duckDBPool } from "../pool";
import { KnownDatabaseStore } from "./knownDatabaseStore";
import { QuackDirectory } from "./quackDirectory";
import { QuackPublisher } from "./quackPublisher";
import { readQuackSettings, type IQuackSettings } from "./quackSettings";

let isStarted = false;

/**
 * Aktiviert Quack, wenn DUCKDB_QUACK_TOKEN gesetzt ist: startet das Verzeichnis, stellt jede
 * künftig geöffnete Datenbank-Datei bereit und öffnet alle bereits bekannten sofort.
 */
export function startQuackFromEnvironment(): void {
  const settings = readQuackSettings();

  if (!settings || isStarted) {
    return;
  }

  isStarted = true;
  const store = new KnownDatabaseStore(settings.stateFilePath);
  const directory = startDirectory(settings);
  const publisher = new QuackPublisher(settings, store, directory);

  duckDBPool.onInstanceOpened((databasePath, instance) => {
    // In-Memory-Datenbanken und URIs wie "md:..." sind keine Dateien, die bestehen bleiben
    if (!isAbsolute(databasePath)) {
      return;
    }

    publisher
      .publish(databasePath, instance)
      .then((database) => LoggerProxy.info(`DuckDB: ${database.path} per Quack als "${database.name}" auf Port ${database.port} bereitgestellt`))
      .catch((error: Error) => LoggerProxy.error(`DuckDB: ${databasePath} konnte nicht per Quack bereitgestellt werden: ${error.message}`));
  });

  openKnownDatabases(store);
}

function startDirectory(settings: IQuackSettings): Promise<QuackDirectory> {
  const directory = new QuackDirectory();
  const started = directory.start(settings).then(() => directory);

  started.then(
    () => LoggerProxy.info(`DuckDB: Quack-Verzeichnis lauscht auf Port ${settings.directoryPort}`),
    (error: Error) => LoggerProxy.error(`DuckDB: Quack-Verzeichnis konnte nicht gestartet werden: ${error.message}`),
  );

  return started;
}

function openKnownDatabases(store: KnownDatabaseStore): void {
  // Fehlende Dateien nicht öffnen, sonst würde DuckDB eine neue, leere Datenbank anlegen
  for (const database of store.load().filter((known) => existsSync(known.path))) {
    duckDBPool
      .getDatabaseInstance(database.path)
      .catch((error: Error) => LoggerProxy.error(`DuckDB: ${database.path} konnte nicht geöffnet werden: ${error.message}`));
  }
}
