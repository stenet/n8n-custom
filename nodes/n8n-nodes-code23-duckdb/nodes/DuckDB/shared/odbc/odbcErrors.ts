// Oracle-Fehler für getrennte Verbindungen (z. B. Neustart, Leerlauf-Limit, Netzwerk) und ODBC-SQLSTATE 08xxx
const CONNECTION_LOST_PATTERN = /ORA-(03113|03114|03135|02396|12170|12537|12541|12543|12547|12571)|\b08(S01|003|007)\b|communication link failure/i;

const CONNECTION_IN_USE_PATTERN = /ODBC connection not found on bind/i;

export function isOdbcConnectionLost(error: Error): boolean {
  return CONNECTION_LOST_PATTERN.test(error.message);
}

/**
 * odbc_scanner meldet eine gerade von einer anderen Abfrage belegte Verbindung als "not found".
 */
export function explainOdbcError(error: Error): Error {
  if (!CONNECTION_IN_USE_PATTERN.test(error.message)) {
    return error;
  }

  return new Error(
    `Die ODBC-Verbindung wird gerade von einer anderen Abfrage verwendet; jede ODBC-Verbindung kann nur von einer Abfrage gleichzeitig genutzt werden. (${error.message})`,
  );
}
