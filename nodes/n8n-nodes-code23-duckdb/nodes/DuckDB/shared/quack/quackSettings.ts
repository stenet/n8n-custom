import { homedir } from "os";
import { join } from "path";

export interface IQuackSettings {
  token: string;
  host: string;
  directoryPort: number;
  stateFilePath: string;
}

/**
 * Liest die Quack-Einstellungen aus der Umgebung. Ohne DUCKDB_QUACK_TOKEN ist Quack deaktiviert.
 */
export function readQuackSettings(): IQuackSettings | undefined {
  const token = process.env.DUCKDB_QUACK_TOKEN;

  if (!token) {
    return undefined;
  }

  return {
    token,
    host: process.env.DUCKDB_QUACK_HOST || "0.0.0.0",
    directoryPort: Number(process.env.DUCKDB_QUACK_PORT || 9494),
    // Liegt im n8n-Datenverzeichnis, damit die Liste einen Container-Neustart übersteht
    stateFilePath: process.env.DUCKDB_QUACK_STATE_FILE || join(homedir(), ".n8n", "duckdb-quack-databases.json"),
  };
}
