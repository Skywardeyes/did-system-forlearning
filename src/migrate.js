import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { loadRuntimeConfig } from './config.js';

const databaseDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'database');

export async function loadMigrations(directory = databaseDirectory) {
  const names = (await readdir(directory)).filter((name) => /^\d{3}-.+\.sql$/.test(name)).sort();
  return Promise.all(names.map(async (name) => ({
    version: Number.parseInt(name.slice(0, 3), 10), name, sql: await readFile(path.join(directory, name), 'utf8'),
  })));
}

async function appliedVersions(pool) {
  try {
    const [rows] = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
    return new Set(rows.map((row) => Number(row.version)));
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') return new Set();
    throw error;
  }
}

export async function runMigrations(pool, { directory = databaseDirectory, report = () => {} } = {}) {
  const migrations = await loadMigrations(directory);
  const applied = await appliedVersions(pool);
  const pending = migrations.filter((migration) => !applied.has(migration.version));
  for (const migration of pending) {
    report(`Applying ${migration.name}`);
    await pool.query(migration.sql);
    report(`Applied ${migration.name}`);
  }
  return { applied: pending.map((migration) => migration.version), currentVersion: migrations.at(-1)?.version || 0 };
}

async function main() {
  const config = loadRuntimeConfig(process.env);
  const pool = mysql.createPool({ ...config.database, ssl: config.database.ssl ? {} : undefined, multipleStatements: true, connectionLimit: 1 });
  try {
    const result = await runMigrations(pool, { report: (message) => process.stdout.write(`${message}\n`) });
    process.stdout.write(`Migration complete. Applied versions: ${result.applied.join(', ') || 'none'}; target: ${result.currentVersion}.\n`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Migration failed: ${error.code || 'DATABASE_ERROR'}\n`);
    process.exitCode = 1;
  });
}
