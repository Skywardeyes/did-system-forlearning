import mysql from 'mysql2/promise';
import { loadRuntimeConfig } from './config.js';
import { MIN_SUPPORTED_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSION } from './mysql-schema.js';

export async function inspectSchema(pool) {
  const [versionRows] = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
  const [tableRows] = await pool.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name REGEXP '^v2_'
     ORDER BY table_name`,
  );
  const versions = versionRows.map((row) => Number(row.version));
  const tables = tableRows.map((row) => row.TABLE_NAME ?? row.table_name);
  const currentVersion = versions.at(-1) || 0;
  return {
    healthy: currentVersion >= MIN_SUPPORTED_SCHEMA_VERSION && currentVersion <= SUPPORTED_SCHEMA_VERSION,
    currentVersion,
    versions,
    tables,
  };
}

async function main() {
  const config = loadRuntimeConfig(process.env);
  const pool = mysql.createPool({ ...config.database, ssl: config.database.ssl ? {} : undefined, connectionLimit: 1 });
  try {
    const result = await inspectSchema(pool);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.healthy) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`Schema check failed: ${error.code || 'DATABASE_ERROR'}\n`);
  process.exitCode = 1;
});
