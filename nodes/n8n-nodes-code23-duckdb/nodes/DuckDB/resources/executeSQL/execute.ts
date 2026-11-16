import type { IDataObject, IExecuteFunctions, INodeExecutionData } from "n8n-workflow";
import { LoggerProxy } from "n8n-workflow";
import type { IDuckDBCredentials } from "../../shared/pool";
import { executeDuckDBQuery, isSelectQuery } from "../../shared/transport";
import { buildParameterMap } from "../../shared/utils";

/**
 * Führt eine SQL-Query auf DuckDB aus.
 * Pro Input-Item wird die Query mit Parametern aus dem Node und Item-Daten ausgeführt.
 * Bei SELECT: Alle Zeilen werden gesammelt.
 * Bei anderen Queries: rowsAffected wird aufsummiert.
 * Dezimalzahlen und Datumsangaben werden korrekt konvertiert.
 */
export async function executeSQL(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
  const credentials = await this.getCredentials<IDuckDBCredentials>("duckDbApi");

  if (!credentials) {
    throw new Error("DuckDB credentials not found");
  }

  const inputItems = this.getInputData();

  if (inputItems.length === 0) {
    return [[]];
  }

  // Query für das erste Item holen, um zu prüfen ob es SELECT ist
  const firstQuery = this.getNodeParameter("query", 0) as string;

  if (!firstQuery) {
    throw new Error("Query parameter is required");
  }

  const isSelect = isSelectQuery(firstQuery);
  const isDuckDbTool = this.getNode().type.endsWith("duckDbTool");
  const allResults: IDataObject[] = [];
  let totalRowsAffected = 0;

  for (let itemIndex = 0; itemIndex < inputItems.length; itemIndex++) {
    // Query pro Item holen
    const query = this.getNodeParameter("query", itemIndex) as string;

    // Parameter pro Item holen
    const rawParameters = this.getNodeParameter("parameters", itemIndex) as Record<string, unknown[]> | undefined;
    const options = this.getNodeParameter("options", itemIndex, {}) as IDataObject;
    const jsonParameters = JSON.parse((options.jsonParameters as string) ?? "{}");

    const parameters = buildParameterMap(rawParameters, jsonParameters);

    // Query ausführen
    let results;
    if (isDuckDbTool) {
      try {
        results = await executeDuckDBQuery(credentials, query, parameters);
      } catch (error) {
        LoggerProxy.warn("DuckDB Tool Query Error", { query, parameters, error });
        const errorMessage = error instanceof Error ? error.message : String(error);
        return [[{
          json: {
            error: `SQL query execution failed with error: ${errorMessage}`
          }
        }]];
      }
    } else {
      results = await executeDuckDBQuery(credentials, query, parameters);
    }

    if (isSelect) {
      // Bei SELECT: Alle Zeilen sammeln
      allResults.push(...results);
    } else {
      // Bei anderen: rowsAffected aufsummieren
      const rowsAffected = results[0]?.rowsAffected as number;
      totalRowsAffected += rowsAffected || 0;
    }
  }

  // falls es ein Tool ist, dann werden alle Daten in einem Objekt zurückgegeben
  if (isSelect && isDuckDbTool) {
    return [[{
      json: {
        items: allResults
      }
    }]];
  }

  // Ergebnisse formatieren
  const finalResults = isSelect ? allResults : [{ rowsAffected: totalRowsAffected }];
  
  const executionData: INodeExecutionData[] = finalResults.map((row) => ({
    json: (row ?? {}) as IDataObject,
  }));

  return [executionData];
}