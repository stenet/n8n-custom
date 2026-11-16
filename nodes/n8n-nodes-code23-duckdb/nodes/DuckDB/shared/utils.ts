import type { DuckDBValue } from "@duckdb/node-api";

/**
 * Konvertiert einen String-Parameter in den richtigen Datentyp.
 */
export function convertParameter(value: string, type: "string" | "number" | "boolean" | "date"): DuckDBValue {
  switch (type) {
    case "number": {
      const num = Number(value);
      if (isNaN(num)) {
        throw new Error(`Cannot convert "${value}" to number`);
      }
      return num;
    }

    case "boolean":
      if (value.toLowerCase() === "true" || value === "1") {
        return true;
      }
      if (value.toLowerCase() === "false" || value === "0") {
        return false;
      }
      throw new Error(`Cannot convert "${value}" to boolean. Expected "true" or "false"`);

    case "date": {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error(`Cannot convert "${value}" to date. Expected ISO 8601 format`);
      }
      return date.toISOString();
    }

    case "string":
    default:
      return typeof value == "object" ? JSON.stringify(value) : value; 
  }
}

/**
 * Konvertiert JSON-Parameter mit automatischer Typerkennung.
 * Unterstützt: number, boolean (→ 0/1), string, date (ISO string).
 * Alle anderen Typen führen zu einem Fehler.
 */
export function parseJsonParameters(jsonParams: object): Record<string, DuckDBValue> {
  if (!jsonParams) {
    return {};
  }

  if (!jsonParams || typeof jsonParams !== "object" || Array.isArray(jsonParams)) {
    throw new Error("jsonParameters must be a JSON object, not an array or primitive value");
  }

  const paramMap: Record<string, DuckDBValue> = {};
  const params = jsonParams as Record<string, unknown>;

  for (const [name, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      throw new Error(`Parameter "${name}" has an invalid value (null/undefined)`);
    }

    const valueType = typeof value;

    switch (valueType) {
      case "number":
        if (isNaN(value as number)) {
          throw new Error(`Parameter "${name}" is NaN`);
        }
        paramMap[name] = value as number;
        break;

      case "boolean":
        paramMap[name] = (value as boolean) ? 1 : 0;
        break;

      case "string":
        paramMap[name] = value as string;
        break;

      default:
        throw new Error(`Parameter "${name}" has an unsupported type: ${valueType}. Allowed types are: number, boolean, string, date (ISO string)`);
    }
  }

  return paramMap;
}

/**
 * Erstellt eine Parameter-Map aus dem fixedCollection Format und optionalen JSON-Parametern.
 * Format fixedCollection: { parameter: [{ name: "id", type: "number", value: "123" }, ...] }
 * Die einzeln definierten Parameter überschreiben JSON-Parameter bei Konflikten.
 */
export function buildParameterMap(
  rawParameters: Record<string, unknown[]> | undefined,
  jsonParameters: object,
): Record<string, DuckDBValue> {
  // Zuerst JSON-Parameter parsen
  const paramMap: Record<string, DuckDBValue> = parseJsonParameters(jsonParameters);

  // Einzelne Parameter aus fixedCollection hinzufügen (überschreiben JSON)
  if (rawParameters && rawParameters.parameter && Array.isArray(rawParameters.parameter)) {
    for (const param of rawParameters.parameter) {
      const paramObj = param as Record<string, unknown>;

      const name = paramObj.name as string;
      const type = (paramObj.type || "string") as "string" | "number" | "boolean" | "date";
      const value = paramObj.value as string;

      if (!name) {
        throw new Error("Parameter name is required");
      }

      if (value == void(0)) {
        throw new Error(`Parameter "${name}" requires a value`);
      }

      paramMap[name] = convertParameter(value, type);
    }
  }

  return paramMap;
}