import { DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import { normalizeDatabasePath } from "./normalizeDatabasePath";
import type { InstanceOpenedListener } from "./instanceOpenedListener";
import { OdbcConnectionRegistry } from "./odbc/odbcConnectionRegistry";
import { parseOdbcConnections } from "./odbc/parseOdbcConnections";

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

  // Pro Instanz die zuletzt registrierte ODBC-Konfiguration und die offenen Verbindungen dazu
  private registeredOdbcConnections: Map<string, string> = new Map();
  private odbcRegistries: Map<string, OdbcConnectionRegistry> = new Map();
  private odbcRegistrations: Map<string, Promise<void>> = new Map();

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

    const odbcConnections = credentials.odbcConnections;

    // Laufende Registrierung abwarten, damit gleichzeitige Aufrufe nicht doppelt registrieren
    await this.odbcRegistrations.get(databasePath);

    if (odbcConnections && this.registeredOdbcConnections.get(databasePath) !== odbcConnections) {
      await this.registerOdbcConnections(databasePath, instance, odbcConnections);
    }

    // Neue Connection zurückgeben
    return instance.connect();
  }

  /**
   * Öffnet die ODBC-Verbindungen des Credentials neu, z. B. nachdem die Gegenstelle sie getrennt hat.
   */
  async reconnectOdbc(credentials: IDuckDBCredentials): Promise<void> {
    if (!credentials.odbcConnections) {
      return;
    }

    const databasePath = normalizeDatabasePath(credentials.path);
    const instance = await this.getDatabaseInstance(databasePath);
    await this.registerOdbcConnections(databasePath, instance, credentials.odbcConnections);
  }

  private registerOdbcConnections(
    databasePath: string,
    instance: DuckDBInstance,
    odbcConnections: string,
  ): Promise<void> {
    const pending = this.odbcRegistrations.get(databasePath);

    if (pending) {
      return pending;
    }

    const registration = this.runOdbcRegistration(databasePath, instance, odbcConnections).finally(() =>
      this.odbcRegistrations.delete(databasePath),
    );
    this.odbcRegistrations.set(databasePath, registration);
    return registration;
  }

  private async runOdbcRegistration(
    databasePath: string,
    instance: DuckDBInstance,
    odbcConnections: string,
  ): Promise<void> {
    let registry = this.odbcRegistries.get(databasePath);

    if (!registry) {
      registry = new OdbcConnectionRegistry();
      this.odbcRegistries.set(databasePath, registry);
    }

    await registry.register(instance, parseOdbcConnections(odbcConnections));
    this.registeredOdbcConnections.set(databasePath, odbcConnections);
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
    this.registeredOdbcConnections.clear();
    this.odbcRegistries.clear();
  }
}

// Singleton-Export
export const duckDBPool = DuckDBConnectionPool.getInstance();