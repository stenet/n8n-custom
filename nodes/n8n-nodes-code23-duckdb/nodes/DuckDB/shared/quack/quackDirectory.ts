import { DuckDBInstance } from "@duckdb/node-api";
import { randomUUID } from "crypto";
import type { IPublishedDatabase } from "./publishedDatabase";
import type { IQuackSettings } from "./quackSettings";
import { serveQuack, toSqlString } from "./serveQuack";

/**
 * Verzeichnis aller bereitgestellten Datenbanken, selbst per Quack auf dem festen Port abrufbar.
 * Die UI fragt es regelmäßig ab und bindet neue Datenbanken ein. Die Generation ändert sich bei
 * jedem n8n-Start, damit die UI ihre Verbindungen danach neu aufbaut.
 */
export class QuackDirectory {
  private readonly generation = randomUUID();
  private instance: DuckDBInstance | undefined;

  async start(settings: IQuackSettings): Promise<void> {
    this.instance = await DuckDBInstance.create(":memory:");
    const connection = await this.instance.connect();

    try {
      await connection.run("CREATE TABLE databases (name VARCHAR PRIMARY KEY, port INTEGER, generation VARCHAR)");
    } finally {
      connection.closeSync();
    }

    await serveQuack(this.instance, settings.directoryPort, settings);
  }

  async add(database: IPublishedDatabase): Promise<void> {
    const connection = await this.instance!.connect();

    try {
      await connection.run(
        `INSERT OR REPLACE INTO databases VALUES (${toSqlString(database.name)}, ${database.port}, ${toSqlString(this.generation)})`,
      );
    } finally {
      connection.closeSync();
    }
  }
}
