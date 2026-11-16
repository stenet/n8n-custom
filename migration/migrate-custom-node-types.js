// Stellt Workflows von installierten Community-Paketen auf die im Image eingebauten Custom Nodes um.
// n8n lädt Nodes aus N8N_CUSTOM_EXTENSIONS mit dem Präfix "CUSTOM." statt mit dem Paketnamen.
// Liest die Datenbank-Einstellungen aus denselben Umgebungsvariablen wie n8n (SQLite und Postgres).
// Aufruf mit gestopptem n8n: node migrate-custom-node-types.js [paketname ...]
// Ohne Paketnamen werden alle im Image eingebauten Node-Pakete migriert.
const fs = require('node:fs');
const path = require('node:path');

const N8N_MODULES = '/usr/local/lib/node_modules/n8n/node_modules';
const CUSTOM_NODES_DIR = process.env.N8N_CUSTOM_EXTENSIONS || '/opt/n8n-custom-nodes';
const TABLE_PREFIX = process.env.DB_TABLE_PREFIX || '';

const readEnv = (name, fallback) => {
  const filePath = process.env[`${name}_FILE`];
  if (filePath) return fs.readFileSync(filePath, 'utf8').trim();
  return process.env[name] ?? fallback;
};

const findBakedNodePackages = () => {
  const { dependencies = {} } = JSON.parse(
    fs.readFileSync(path.join(CUSTOM_NODES_DIR, 'package.json'), 'utf8'),
  );
  return Object.keys(dependencies).filter((packageName) => {
    const manifestPath = path.join(CUSTOM_NODES_DIR, 'node_modules', packageName, 'package.json');
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')).n8n !== undefined;
  });
};

const createSqliteClient = () => {
  const sqlite3 = require(`${N8N_MODULES}/sqlite3`);
  const n8nFolder = process.env.N8N_USER_FOLDER || '/home/node';
  const databasePath = readEnv('DB_SQLITE_DATABASE', path.join(n8nFolder, '.n8n', 'database.sqlite'));
  if (!fs.existsSync(databasePath)) throw new Error(`SQLite-Datenbank nicht gefunden: ${databasePath}`);
  const database = new sqlite3.Database(databasePath);
  const execute = (sql, parameters = []) =>
    new Promise((resolve, reject) =>
      database.run(sql.replace(/\$\d+/g, '?'), parameters, function (error) {
        error ? reject(error) : resolve(this.changes);
      }),
    );
  return {
    label: `SQLite (${databasePath})`,
    table: (name) => `"${TABLE_PREFIX}${name}"`,
    nodesAsText: 'nodes',
    textAsNodes: (expression) => expression,
    contains: (parameter) => `INSTR(nodes, ${parameter}) > 0`,
    execute,
    close: async () => database.close(),
  };
};

const createPostgresClient = async () => {
  const { Client } = require(`${N8N_MODULES}/pg`);
  const isSslEnabled = readEnv('DB_POSTGRESDB_SSL_ENABLED', 'false') === 'true';
  const client = new Client({
    host: readEnv('DB_POSTGRESDB_HOST', 'localhost'),
    port: Number(readEnv('DB_POSTGRESDB_PORT', '5432')),
    database: readEnv('DB_POSTGRESDB_DATABASE', 'n8n'),
    user: readEnv('DB_POSTGRESDB_USER', 'postgres'),
    password: readEnv('DB_POSTGRESDB_PASSWORD', ''),
    ssl: isSslEnabled
      ? { rejectUnauthorized: readEnv('DB_POSTGRESDB_SSL_REJECT_UNAUTHORIZED', 'true') !== 'false' }
      : false,
  });
  await client.connect();
  const schema = readEnv('DB_POSTGRESDB_SCHEMA', 'public');
  return {
    label: `Postgres (${client.host}:${client.port}/${client.database}, Schema ${schema})`,
    table: (name) => `"${schema}"."${TABLE_PREFIX}${name}"`,
    nodesAsText: 'nodes::text',
    textAsNodes: (expression) => `(${expression})::json`,
    contains: (parameter) => `STRPOS(nodes::text, ${parameter}) > 0`,
    execute: async (sql, parameters = []) => (await client.query(sql, parameters)).rowCount,
    close: async () => client.end(),
  };
};

const createClient = async () => {
  const databaseType = readEnv('DB_TYPE', 'sqlite');
  if (databaseType === 'sqlite') return createSqliteClient();
  if (databaseType === 'postgresdb') return await createPostgresClient();
  throw new Error(`Nicht unterstützter DB_TYPE: ${databaseType}`);
};

const migratePackage = async (client, packageName) => {
  const oldPrefix = `"${packageName}.`;
  for (const table of ['workflow_entity', 'workflow_history']) {
    const replaced = `REPLACE(${client.nodesAsText}, $1, '"CUSTOM.')`;
    const changedRows = await client.execute(
      `UPDATE ${client.table(table)} SET nodes = ${client.textAsNodes(replaced)} WHERE ${client.contains('$2')}`,
      [oldPrefix, oldPrefix],
    );
    console.log(`  ${table}: ${changedRows} Zeilen umgestellt`);
  }
  // n8n ergänzt den Abhängigkeitsindex beim Start um die neuen Typen, entfernt die alten aber nicht
  const removedDependencies = await client.execute(
    `DELETE FROM ${client.table('workflow_dependency')} WHERE "dependencyType" = 'nodeType' AND "dependencyKey" LIKE $1`,
    [`${packageName}.%`],
  );
  console.log(`  workflow_dependency: ${removedDependencies} veraltete Einträge entfernt`);
};

const main = async () => {
  const requestedPackages = process.argv.slice(2);
  const packageNames = requestedPackages.length > 0 ? requestedPackages : findBakedNodePackages();
  const client = await createClient();
  console.log(`Datenbank: ${client.label}`);
  try {
    await client.execute('BEGIN');
    for (const packageName of packageNames) {
      console.log(`Paket ${packageName}:`);
      await migratePackage(client, packageName);
    }
    await client.execute('COMMIT');
    console.log('Migration abgeschlossen.');
  } catch (error) {
    await client.execute('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.close();
  }
};

main().catch((error) => {
  console.error(`Migration fehlgeschlagen, keine Änderungen gespeichert: ${error.message}`);
  process.exitCode = 1;
});
