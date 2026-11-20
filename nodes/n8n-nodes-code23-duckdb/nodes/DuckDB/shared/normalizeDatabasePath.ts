import { resolve } from "path";

const IN_MEMORY_PATH = ":memory:";

// Pfade wie "md:datenbank" oder "s3://bucket/datei.db" sind keine lokalen Dateien
const URI_PATTERN = /^[a-z][a-z0-9+.-]+:/i;

/**
 * Vereinheitlicht Dateipfade, damit z. B. "/files/./duckdb.db" und "/files/duckdb.db"
 * dieselbe Instanz verwenden. Ein zweites Öffnen derselben Datei im selben Prozess schlägt fehl.
 */
export function normalizeDatabasePath(databasePath: string): string {
  const trimmedPath = databasePath.trim();

  if (trimmedPath === "" || trimmedPath === IN_MEMORY_PATH || URI_PATTERN.test(trimmedPath)) {
    return trimmedPath;
  }

  return resolve(trimmedPath);
}
