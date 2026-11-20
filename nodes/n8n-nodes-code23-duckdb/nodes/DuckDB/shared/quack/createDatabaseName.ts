import { basename, extname } from "path";

/**
 * Leitet aus dem Dateinamen einen eindeutigen SQL-Bezeichner ab, z. B. "/files/duckdb.db" → "duckdb".
 */
export function createDatabaseName(databasePath: string, usedNames: string[]): string {
  const fileName = basename(databasePath, extname(databasePath));
  const identifier = fileName.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const baseName = /^[a-z_]/.test(identifier) ? identifier : `db_${identifier}`;

  let name = baseName;
  for (let suffix = 2; usedNames.includes(name); suffix++) {
    name = `${baseName}_${suffix}`;
  }

  return name;
}
