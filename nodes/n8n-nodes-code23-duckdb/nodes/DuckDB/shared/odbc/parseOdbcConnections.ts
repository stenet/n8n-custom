export interface IOdbcConnectionDefinition {
  name: string;
  connectionString: string;
}

// Der Name wird als Makro-Name direkt in SQL eingesetzt
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Liest die ODBC-Verbindungen aus dem Credential. Format: NAME=connection_string (eine pro Zeile).
 */
export function parseOdbcConnections(odbcConnections: string): IOdbcConnectionDefinition[] {
  return odbcConnections
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseLine);
}

function parseLine(line: string): IOdbcConnectionDefinition {
  const equalsIndex = line.indexOf("=");
  const name = line.substring(0, equalsIndex).trim();
  const connectionString = line.substring(equalsIndex + 1).trim();

  if (equalsIndex === -1 || !NAME_PATTERN.test(name) || !connectionString) {
    throw new Error(`Invalid ODBC connection format: "${line}". Expected: NAME=connection_string`);
  }

  return { name, connectionString };
}
