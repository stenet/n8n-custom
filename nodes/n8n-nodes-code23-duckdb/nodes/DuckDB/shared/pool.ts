import { DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";

export interface IDuckDBCredentials {
  path: string;
  odbcConnections?: string;
}

/**
 * Database-Instanz-Cache für DuckDB.
 * Verwaltet pro Path eine Database-Instanz und gibt neue Connections zurück.
 * Nach außen hin API wie ein Connection-Pool.
 * Implementiert als Singleton für globale Wiederverwendung.
 */
class DuckDBConnectionPool {
  private static instance: DuckDBConnectionPool;

  // Gespeicherte Database-Instanzen nach Path
  private instances: Map<string, DuckDBInstance> = new Map();

  // Tracking der zuletzt registrierten ODBC-Verbindungen pro Instanz
  private odbcConnectionsRegistry: Map<string, string | undefined> = new Map();

  private constructor() {
  }

  static getInstance(): DuckDBConnectionPool {
    if (!DuckDBConnectionPool.instance) {
      DuckDBConnectionPool.instance = new DuckDBConnectionPool();
    }
    return DuckDBConnectionPool.instance;
  }

  /**
   * Holt eine Connection aus einer Database-Instanz.
   * Initialisiert die Database-Instanz und registriert ODBC-Verbindungen falls nötig.
   */
  async getConnection(credentials: IDuckDBCredentials): Promise<DuckDBConnection> {
    let instance = this.instances.get(credentials.path);

    // Database-Instanz initialisieren falls nicht vorhanden
    if (!instance) {
      instance = await DuckDBInstance.create(credentials.path);
      this.instances.set(credentials.path, instance);
    }

    // ODBC-Verbindungen prüfen und registrieren wenn nötig
    const previousOdbcConnections = this.odbcConnectionsRegistry.get(credentials.path);
    const currentOdbcConnections = credentials.odbcConnections;

    if (currentOdbcConnections && previousOdbcConnections !== currentOdbcConnections) {
      await this.registerODBCConnections(instance, currentOdbcConnections);
      this.odbcConnectionsRegistry.set(credentials.path, currentOdbcConnections);
    }

    // Neue Connection zurückgeben
    return instance.connect();
  }

  /**
   * Schließt eine Connection.
   */
  async releaseConnection(connection: DuckDBConnection): Promise<void> {
    connection.closeSync();
  }

  /**
   * Schließt alle Database-Instanzen und gibt Ressourcen frei.
   * Sollte beim Herunterfahren aufgerufen werden.
   */
  async closeAll(): Promise<void> {
    for (const instance of this.instances.values()) {
      try {
        instance.closeSync();
      } catch {
        // Fehler beim Schließen ignorieren
      }
    }
    this.instances.clear();
    this.odbcConnectionsRegistry.clear();
  }

  /**
   * Registriert ODBC-Verbindungen für eine Database-Instanz.
   * Format: NAME=connection_string (ein pro Zeile)
   */
  private async registerODBCConnections(
    instance: DuckDBInstance,
    odbcConnectionsString: string,
  ): Promise<void> {
    const lines = odbcConnectionsString
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // Nur wenn ODBC-Verbindungen vorhanden
    if (lines.length === 0) {
      return;
    }

    const connection = await instance.connect();

    try {
      // ODBC-Erweiterung einmalig installieren und laden
      await connection.run("INSTALL nanodbc FROM community; LOAD nanodbc;");

      // Jede ODBC-Verbindung registrieren
      for (const line of lines) {
        const equalsIndex = line.indexOf("=");

        if (equalsIndex === -1) {
          throw new Error(
            `Invalid ODBC connection format: "${line}". Expected: NAME=connection_string`,
          );
        }

        const name = line.substring(0, equalsIndex);
        const connectionString = line.substring(equalsIndex + 1);

        if (!name || !connectionString) {
          throw new Error(
            `Invalid ODBC connection format: "${line}". Expected: NAME=connection_string`,
          );
        }

        const trimmedName = name.trim();
        const trimmedConnectionString = connectionString.trim();

        const macroQuery = `CREATE OR REPLACE MACRO ${trimmedName}(sql) as table (select * from odbc_query(connection='${trimmedConnectionString}', query=sql))`;

        try {
          await connection.run(macroQuery);
        } catch (error) {
          throw new Error(
            `Failed to register ODBC connection "${trimmedName}": ${(error as Error).message}`,
          );
        }
      }
    } finally {
      connection.closeSync();
    }
  }
}

// Singleton-Export
export const duckDBPool = DuckDBConnectionPool.getInstance();