import type { DuckDBValue } from "@duckdb/node-api";
import type { IDataObject } from "n8n-workflow";
import { duckDBPool, type IDuckDBCredentials } from "./pool";

/**
 * Prüft, ob eine SQL-Query eine SELECT-Abfrage ist (inkl. CTEs).
 */
export function isSelectQuery(query: string): boolean {
  // Whitespace trimmen und Case-insensitive machen
  const trimmedQuery = query.trim().toUpperCase();

  // CTEs mit WITH ... AS ... SELECT
  if (trimmedQuery.startsWith("WITH")) {
    return trimmedQuery.includes("SELECT");
  }

  // Direkte SELECT
  return trimmedQuery.startsWith("SELECT");
}

/**
 * Führt eine SQL-Abfrage auf DuckDB aus.
 * Bei SELECT-Abfragen: Gibt alle Zeilen zurück.
 * Bei anderen Statements: Gibt rowsAffected zurück.
 * Nutzt den Connection-Pool für Ressourcen-Management.
 * Konvertiert Dezimalzahlen und Datumsangaben zu korrekten Formaten.
 */
export async function executeDuckDBQuery(
  credentials: IDuckDBCredentials,
  query: string,
  parameters?: Record<string, DuckDBValue>,
): Promise<IDataObject[]> {
  // Connection aus Pool holen
  const connection = await duckDBPool.getConnection(credentials);

  try {
    const result = await connection.run(query, parameters);

    // Prüfen ob es ein SELECT ist
    if (isSelectQuery(query)) {
      // getRowObjectsJson() konvertiert automatisch:
      // - Dezimalzahlen zu Strings mit korrekter Scale
      // - Datumsangaben zu ISO-String Format
      return (await result.getRowObjectsJson()) as IDataObject[];
    }

    // Für nicht-SELECT: rowsAffected zurückgeben
    const rowsAffected = result.rowsChanged;
    return [{ rowsAffected }];
  } finally {
    // Connection freigeben (schließen)
    await duckDBPool.releaseConnection(connection);
  }
}
