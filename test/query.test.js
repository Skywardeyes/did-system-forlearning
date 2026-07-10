import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePageSize, queryRecords } from '../src/query.js';

const rows = Array.from({ length: 51 }, (_, index) => ({
  id: String(index + 1).padStart(3, '0'),
  name: index === 50 ? 'Alice 学员' : `学员${index}`,
  status: index % 2 ? 'active' : 'revoked',
  createdAt: index < 2
    ? '2026-07-10T00:00:00.000Z'
    : new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
}));

test('搜索去除首尾空格且忽略大小写', () => {
  const result = queryRecords(rows, {
    search: '  ALICE ', fields: ['name'], page: 1, pageSize: 10, timeField: 'createdAt',
  });

  assert.equal(result.total, 1);
  assert.equal(result.items[0].name, 'Alice 学员');
});

test('时间相同时按 id 降序并对 51 条记录分页', () => {
  const result = queryRecords(rows, {
    fields: ['name'], page: 1, pageSize: 50, timeField: 'createdAt',
  });

  assert.equal(result.totalPages, 2);
  assert.equal(result.items.length, 50);
  assert.equal(result.items[0].id, '002');
});

test('超界页修正为最后一个有效页', () => {
  const result = queryRecords(rows, {
    fields: ['name'], page: 99, pageSize: 20, timeField: 'createdAt',
  });

  assert.equal(result.page, 3);
  assert.equal(result.items.length, 11);
});

test('空结果停留第一页并规范不支持的每页数量', () => {
  const result = queryRecords([], {
    fields: ['name'], page: 5, pageSize: 12, timeField: 'createdAt',
  });

  assert.deepEqual(result, { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 });
  assert.equal(normalizePageSize(20), 20);
  assert.equal(normalizePageSize(999), 10);
});
