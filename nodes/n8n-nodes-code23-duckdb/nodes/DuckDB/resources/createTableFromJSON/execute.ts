import { promises as fs } from "fs";
import { join } from "path";
import type { IDataObject, IExecuteFunctions, INodeExecutionData } from "n8n-workflow";
import type { IDuckDBCredentials } from "../../shared/pool";
import { executeDuckDBQuery } from "../../shared/transport";

/**
 * Erstellt eine DuckDB-Tabelle aus JSON-Daten.
 * Falls mehrere inputData vorhanden sind, werden sie zu einem JSON Array kombiniert.
 * Das Array wird temporär in eine Datei geschrieben, dann per read_json() eingelesen.
 * Nach der Ausführung wird die temporäre Datei gelöscht.
 * Gibt rowsAffected zurück.
 */
export async function createTableFromJSON(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
  const credentials = await this.getCredentials<IDuckDBCredentials>("duckDbApi");

  if (!credentials) {
    throw new Error("DuckDB credentials not found");
  }

  const inputItems = this.getInputData();

  if (inputItems.length === 0) {
    return [[]];
  }

  const tableName = this.getNodeParameter("tableName", 0) as string;

  if (!tableName) {
    throw new Error("Table Name parameter is required");
  }

  // Alle JSON-Daten sammeln
  const combinedData: unknown[] = [];

  for (let itemIndex = 0; itemIndex < inputItems.length; itemIndex++) {
    let jsonData = this.getNodeParameter("jsonString", itemIndex) as unknown;

    if (!jsonData) {
      throw new Error("JSON String parameter is required");
    }

    // JSON-String zu Object konvertieren falls nötig
    if (typeof jsonData === "string") {
      jsonData = JSON.parse(jsonData);
    }

    // Falls jsonData ein Array ist, alle Items hinzufügen
    if (Array.isArray(jsonData)) {
      combinedData.push(...jsonData);
    } else {
      // Falls jsonData ein einzelnes Objekt ist, hinzufügen
      combinedData.push(jsonData);
    }
  }

  if (combinedData.length === 0) {
    throw new Error("No valid JSON data found");
  }

  // Kombiniertes Array zu JSON-String konvertieren
  const jsonStringForFile = JSON.stringify(combinedData);

  // Temporäre Datei erstellen mit Zeitstempel
  const tempFileName = `duckdb_${Date.now()}.json`;
  const tempFilePath = join("/tmp", tempFileName);

  try {
    // Kombiniertes JSON-Array in temporäre Datei schreiben
    await fs.writeFile(tempFilePath, jsonStringForFile, "utf-8");

    const query = `CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_json('${tempFilePath}')`;

    // Query ausführen
    const queryResults = await executeDuckDBQuery(credentials, query, {});

    // rowsAffected extrahieren
    const rowsAffected = queryResults[0]?.rowsAffected as number;

    const resultItem: INodeExecutionData = {
      json: {
        rowsAffected: rowsAffected || 0,
      } as IDataObject,
    };

    return [[resultItem]];
  } finally {
    // Temporäre Datei immer löschen, auch bei Fehler
    await fs.unlink(tempFilePath).catch(() => {
      // Fehler beim Löschen ignorieren
    });
  }
}
