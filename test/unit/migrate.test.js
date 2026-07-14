import assert from 'node:assert/strict';
import test from 'node:test';
import { loadMigrations, runMigrations } from '../../src/migrate.js';

test('migration loader discovers ordered numbered SQL migrations', async () => {
  const migrations = await loadMigrations();
  assert.deepEqual(migrations.map((migration) => migration.version), [1, 2, 3, 4, 5]);
  assert.match(migrations[2].sql, /v2_credentials/);
});

test('migration runner applies only versions absent from schema migrations', async () => {
  const queries = [];
  const pool = { async query(sql) {
    queries.push(sql);
    if (sql.startsWith('SELECT version')) return [[{ version: 1 }]];
    return [[]];
  } };
  const result = await runMigrations(pool);
  assert.deepEqual(result.applied, [2, 3, 4, 5]);
  assert.equal(queries.filter((sql) => /CREATE TABLE IF NOT EXISTS v2_/.test(sql)).length, 4);
});
