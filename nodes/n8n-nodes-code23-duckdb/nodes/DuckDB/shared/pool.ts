import { DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import { normalizeDatabasePath } from "./normalizeDatabasePath";
import type { InstanceOpenedListener } from "./instanceOpenedListener";

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

  // Promise statt Instanz speichern, damit gleichzeitige Aufrufe (z. B. Quack-Start und Workflow)
  // nicht zwei Instanzen auf dieselbe Datei öffnen
  private instances: Map<string, Promise<DuckDBInstance>> = new Map();

  // Tracking der zuletzt registrierten ODBC-Verbindungen pro Instanz
  private odbcConnectionsRegistry: Map<string, string | undefined> = new Map();

  private instanceOpenedListeners: InstanceOpenedListener[] = [];

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
    const databasePath = normalizeDatabasePath(credentials.path);
    const instance = await this.getDatabaseInstance(databasePath);

    // ODBC-Verbindungen prüfen und registrieren wenn nötig
    const previousOdbcConnections = this.odbcConnectionsRegistry.get(databasePath);
    const currentOdbcConnections = credentials.odbcConnections;

    if (currentOdbcConnections && previousOdbcConnections !== currentOdbcConnections) {
      await this.registerODBCConnections(instance, currentOdbcConnections);
      this.odbcConnectionsRegistry.set(databasePath, currentOdbcConnections);
    }

    // Neue Connection zurückgeben
    return instance.connect();
  }

  /**
   * Liefert die Database-Instanz zum Path und öffnet sie beim ersten Zugriff.
   */
  async getDatabaseInstance(databasePath: string): Promise<DuckDBInstance> {
    const key = normalizeDatabasePath(databasePath);
    let instance = this.instances.get(key);

    if (!instance) {
      instance = DuckDBInstance.create(key);
      this.instances.set(key, instance);
      instance.then(
        (openedInstance) => this.notifyInstanceOpened(key, openedInstance),
        // Fehlgeschlagenes Öffnen nicht cachen, damit der nächste Zugriff es erneut versucht
        () => this.instances.delete(key),
      );
    }

    return instance;
  }

  /**
   * Meldet jede neu geöffnete Database-Instanz, z. B. um sie per Quack bereitzustellen.
   */
  onInstanceOpened(listener: InstanceOpenedListener): void {
    this.instanceOpenedListeners.push(listener);
  }

  private notifyInstanceOpened(databasePath: string, instance: DuckDBInstance): void {
    for (const listener of this.instanceOpenedListeners) {
      listener(databasePath, instance);
    }
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
        (await instance).closeSync();
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
      // nanodbc wird ab DuckDB 1.5 nicht mehr gebaut; odbc_scanner ist die offizielle Nachfolge-Erweiterung
      await connection.run("INSTALL odbc_scanner; LOAD odbc_scanner;");

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

        const macroQuery = `CREATE OR REPLACE MACRO ${trimmedName}(sql) as table (select * from odbc_query('${trimmedConnectionString}', sql))`;

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