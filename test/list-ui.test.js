import assert from 'node:assert/strict';
import test from 'node:test';
import { applyListAction, renderPagination } from '../public/list-ui.js';

test('搜索和页大小变化都返回第一页', () => {
  const initial = { search: '', page: 3, pageSize: 10 };
  assert.deepEqual(applyListAction(initial, { type: 'search', value: ' Alice ' }), { search: ' Alice ', page: 1, pageSize: 10 });
  assert.deepEqual(applyListAction(initial, { type: 'pageSize', value: 20 }), { search: '', page: 1, pageSize: 20 });
});

test('pagination renders a labeled page-size selector on the current-page row', () => {
  const html = renderPagination(
    { page: 2, totalPages: 3, total: 25 },
    { id: 'did', pageSize: 20 },
  );
  assert.match(html, /每页展示/);
  assert.match(html, /id="did-page-size"/);
  assert.match(html, /<option value="20" selected>20<\/option>/);
  assert.match(html, /共 25 条 · 2\/3 页/);
});

test('首页禁用上一页且末页禁用下一页', () => {
  assert.match(renderPagination({ page: 1, totalPages: 3, total: 21 }), /data-page="prev" disabled/);
  assert.match(renderPagination({ page: 3, totalPages: 3, total: 21 }), /data-page="next" disabled/);
});
