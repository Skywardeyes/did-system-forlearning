import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePageSize, queryRecords } from '../../src/query.js';

test('page size accepts only 10, 20 and 50 and defaults to 10', () => {
  for (const value of [undefined, null, '', 0, 1, 11, 21, 51, 'abc']) assert.equal(normalizePageSize(value), 10);
  for (const value of [10, '10', 20, '20', 50, '50']) assert.equal(normalizePageSize(value), Number(value));
});

test('search treats special characters as plain case-insensitive text', () => {
  const records = [
    { id: '2', name: 'Alice [Admin]', createdAt: '2026-01-01T00:00:00Z' },
    { id: '1', name: 'Bob', createdAt: '2026-01-02T00:00:00Z' },
  ];
  assert.deepEqual(queryRecords(records, { search: ' [ADMIN] ', fields: ['name'], timeField: 'createdAt' }).items.map((item) => item.id), ['2']);
  assert.equal(queryRecords(records, { search: '.*', fields: ['name'], timeField: 'createdAt' }).total, 0);
});

test('query applies stable ordering and page boundary correction', () => {
  const records = Array.from({ length: 51 }, (_, index) => ({ id: String(index).padStart(2, '0'), createdAt: '2026-01-01T00:00:00Z' }));
  const last = queryRecords(records, { page: 999, pageSize: 20, fields: [], timeField: 'createdAt' });
  assert.equal(last.page, 3);
  assert.equal(last.totalPages, 3);
  assert.equal(last.items.length, 11);
  assert.equal(last.items[0].id, '10');
  assert.equal(queryRecords([], { page: -3, pageSize: 50, fields: [], timeField: 'createdAt' }).page, 1);
});
