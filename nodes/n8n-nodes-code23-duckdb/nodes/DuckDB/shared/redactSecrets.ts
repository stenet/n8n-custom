// Werte in geschweiften Klammern dürfen laut ODBC-Syntax Semikolons enthalten
const SECRET_PATTERN = /\b(pwd|password)(\s*=\s*)(\{[^}]*\}|[^;'"\s]*)/gi;

/**
 * Entfernt Passwörter aus ODBC-Connection-Strings in Fehlermeldungen,
 * damit sie nicht in den Ausführungsprotokollen von n8n landen.
 */
export function redactSecrets(message: string): string {
  return message.replace(SECRET_PATTERN, "$1$2***");
}

/**
 * Wandelt einen beliebigen Fehler in einen Error ohne Passwörter um.
 */
export function toRedactedError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(redactSecrets(message));
}
