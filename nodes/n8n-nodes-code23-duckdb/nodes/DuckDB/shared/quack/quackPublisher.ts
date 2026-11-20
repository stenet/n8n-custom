import type { DuckDBInstance } from "@duckdb/node-api";
import { createDatabaseName } from "./createDatabaseName";
import type { KnownDatabaseStore } from "./knownDatabaseStore";
import type { IPublishedDatabase } from "./publishedDatabase";
import type { QuackDirectory } from "./quackDirectory";
import type { IQuackSettings } from "./quackSettings";
import { serveQuack } from "./serveQuack";

/**
 * Stellt jede geöffnete Datenbank-Datei über einen eigenen Quack-Server bereit.
 * Ein gemeinsamer Server würde alle Tabellen in einem Katalog zusammenlegen,
 * wodurch gleichnamige Tabellen verschiedener Dateien nicht mehr abfragbar wären.
 */
export class QuackPublisher {
  constructor(
    private readonly settings: IQuackSettings,
    private readonly store: KnownDatabaseStore,
    private readonly directory: Promise<QuackDirectory>,
  ) {}

  async publish(databasePath: string, instance: DuckDBInstance): Promise<IPublishedDatabase> {
    const database = this.resolveDatabase(databasePath);

    await serveQuack(instance, database.port, this.settings);
    await (await this.directory).add(database);

    return database;
  }

  private resolveDatabase(databasePath: string): IPublishedDatabase {
    const knownDatabases = this.store.load();
    const knownDatabase = knownDatabases.find((database) => database.path === databasePath);

    if (knownDatabase) {
      return knownDatabase;
    }

    const usedPorts = knownDatabases.map((database) => database.port);
    const newDatabase: IPublishedDatabase = {
      path: databasePath,
      name: createDatabaseName(databasePath, knownDatabases.map((database) => database.name)),
      port: Math.max(this.settings.directoryPort, ...usedPorts) + 1,
    };

    this.store.save([...knownDatabases, newDatabase]);
    return newDatabase;
  }
}
