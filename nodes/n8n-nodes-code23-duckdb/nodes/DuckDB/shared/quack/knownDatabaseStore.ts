import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { IPublishedDatabase } from "./publishedDatabase";

/**
 * Merkt sich alle jemals bereitgestellten Datenbanken, damit sie nach einem Neustart
 * ohne Workflow-Ausführung wieder verfügbar sind und ihren Port behalten.
 */
export class KnownDatabaseStore {
  constructor(private readonly filePath: string) {}

  load(): IPublishedDatabase[] {
    if (!existsSync(this.filePath)) {
      return [];
    }

    return JSON.parse(readFileSync(this.filePath, "utf8")) as IPublishedDatabase[];
  }

  save(databases: IPublishedDatabase[]): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(databases, null, 2));
  }
}
