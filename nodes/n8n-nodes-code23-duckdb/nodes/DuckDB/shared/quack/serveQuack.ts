import type { DuckDBInstance } from "@duckdb/node-api";
import type { IQuackSettings } from "./quackSettings";

/**
 * Startet einen Quack-Server für alles, was die übergebene Instanz sieht.
 */
export async function serveQuack(instance: DuckDBInstance, port: number, settings: IQuackSettings): Promise<void> {
  const connection = await instance.connect();
  const listenUri = `quack:${settings.host}:${port}`;

  try {
    // Der Server ist nur im internen Docker-Netzwerk erreichbar; TLS übernimmt davor cloudflared
    await connection.run(
      `CALL quack_serve(${toSqlString(listenUri)}, allow_other_hostname = true, disable_ssl = true, token = ${toSqlString(settings.token)})`,
    );
  } finally {
    connection.closeSync();
  }
}

export function toSqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
