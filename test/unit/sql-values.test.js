import assert from 'node:assert/strict';
import test from 'node:test';
import { sqlDate, sqlPagination } from '../../src/repositories/sql-values.js';

test('SQL date conversion accepts ISO timestamps and rejects invalid values', () => {
  assert.equal(sqlDate('2026-07-13T00:00:00.000Z') instanceof Date, true);
  assert.equal(sqlDate(null), null);
  assert.throws(() => sqlDate('not-a-date'), /Invalid timestamp/);
});

test('SQL pagination returns bounded integers safe for LIMIT and OFFSET literals', () => {
  assert.deepEqual(sqlPagination('2', '20'), { page: 2, pageSize: 20, offset: 20 });
  assert.deepEqual(sqlPagination('bad', '999'), { page: 1, pageSize: 100, offset: 0 });
  assert.deepEqual(sqlPagination(undefined, undefined), { page: 1, pageSize: 20, offset: 0 });
});
