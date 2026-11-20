import type { DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import type { IOdbcConnectionDefinition } from "./parseOdbcConnections";

/**
 * Hält pro ODBC-Verbindung eines Credentials genau eine offene Verbindung und ein Makro darauf.
 * odbc_query mit Connection-String öffnet pro Abfrage eine eigene Verbindung; mit dem Oracle-Treiber
 * führte das reproduzierbar zu Abstürzen (Segfault), mit einer per odbc_connect geöffneten nicht.
 * Eine Verbindung kann nur von einer Abfrage gleichzeitig genutzt werden, weitere schlagen fehl.
 */
export class OdbcConnectionRegistry {
  private readonly handles = new Map<string, bigint>();

  async register(instance: DuckDBInstance, definitions: IOdbcConnectionDefinition[]): Promise<void> {
    const connection = await instance.connect();

    try {
      await connection.run("INSTALL odbc_scanner; LOAD odbc_scanner;");

      for (const definition of definitions) {
        await this.registerConnection(connection, definition);
      }
    } finally {
      connection.closeSync();
    }
  }

  private async registerConnection(connection: DuckDBConnection, definition: IOdbcConnectionDefinition): Promise<void> {
    await this.close(connection, definition.name);

    const result = await connection.run(`SELECT odbc_connect(${toSqlString(definition.connectionString)})::BIGINT AS handle`);
    const handle = BigInt((await result.getRowObjectsJson())[0].handle as string);
    this.handles.set(definition.name, handle);

    // Das Makro enthält nur das Handle, nicht den Connection-String mit Passwort
    await connection.run(
      `CREATE OR REPLACE MACRO ${definition.name}(sql) AS TABLE (SELECT * FROM odbc_query(${handle}::BIGINT, sql))`,
    );
  }

  private async close(connection: DuckDBConnection, name: string): Promise<void> {
    const handle = this.handles.get(name);

    if (handle === undefined) {
      return;
    }

    this.handles.delete(name);
    // Eine bereits abgebrochene Verbindung lässt sich nicht mehr sauber schließen; neu öffnen geht trotzdem
    await connection.run(`SELECT odbc_close(${handle}::BIGINT)`).catch(() => undefined);
  }
}

function toSqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
