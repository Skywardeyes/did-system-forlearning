import assert from 'node:assert/strict';
import test from 'node:test';
import { applyLogFilter, createLogFilters, renderLogLevel, renderLogRow } from '../public/log-ui.js';

test('日志级别同时输出颜色类和文字', () => {
  assert.match(renderLogLevel('info'), /log-level info[^>]*>INFO/);
  assert.match(renderLogLevel('warn'), /log-level warn[^>]*>WARN/);
  assert.match(renderLogLevel('error'), /log-level error[^>]*>ERROR/);
});

test('任一筛选变化后回到第一页', () => {
  const initial = { ...createLogFilters(), page: 3 };
  const next = applyLogFilter(initial, { type: 'level', value: 'warn' });
  assert.equal(next.page, 1);
  assert.equal(next.level, 'warn');
});

test('日志行转义用户可控文本并提供详情入口', () => {
  const html = renderLogRow({
    id: 'log-1', occurredAt: '2026-07-10T00:00:00.000Z', type: 'audit', level: 'warn', module: 'DID',
    action: 'DID_CREATE', success: false, targetName: '<img src=x onerror=alert(1)>', message: '<script>bad()</script>',
  }, { formatDate: () => '2026/7/10' });
  assert.doesNotMatch(html, /<script>|<img/);
  assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.match(html, /data-log-detail="log-1"/);
});
