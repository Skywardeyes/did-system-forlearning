import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAnalysis,
  formatRunTime,
  parseNodeTap,
  parsePlaywright,
  renderMarkdown,
} from '../helpers/test-records.js';

test('formats Asia/Shanghai timestamps and safe directory names', () => {
  const value = formatRunTime(new Date('2026-07-10T13:30:15.000Z'));
  assert.equal(value.iso, '2026-07-10T13:30:15.000Z');
  assert.equal(value.local, '2026-07-10 21:30:15');
  assert.equal(value.dateDirectory, '2026-07-10');
  assert.equal(value.runDirectory, '2026-07-10T21-30-15+08-00');
});

test('parses Node TAP totals and failure names', () => {
  const output = `not ok 2 - concurrent service writes preserve both identities
1..3
# tests 3
# pass 2
# fail 1
# skipped 0
# todo 0`;
  assert.deepEqual(parseNodeTap(output), {
    tests: 3, passed: 2, failed: 1, skipped: 0, todo: 0,
    failureNames: ['concurrent service writes preserve both identities'],
    parsed: true,
  });
  assert.equal(parseNodeTap('no summary').parsed, false);
});

test('parses Playwright success and mixed results', () => {
  assert.deepEqual(parsePlaywright('  6 passed (9.4s)'), {
    tests: 6, passed: 6, failed: 0, skipped: 0, todo: 0, failureNames: [], parsed: true,
  });
  const mixed = parsePlaywright('  1) [chromium] › file.spec.js:3:1 › broken journey\n  1 failed\n  5 passed (10s)');
  assert.equal(mixed.tests, 6);
  assert.equal(mixed.failed, 1);
  assert.deepEqual(mixed.failureNames, ['broken journey']);
});

test('analysis separates known and new failures and calculates pass rate', () => {
  const analysis = buildAnalysis({
    node: { tests: 4, passed: 2, failed: 2, skipped: 0, todo: 0, failureNames: ['known failure', 'new failure'], parsed: true },
    ui: { tests: 2, passed: 2, failed: 0, skipped: 0, todo: 0, failureNames: [], parsed: true },
    knownFailures: ['known failure'],
    previous: { total: 6, failed: 4, passRate: 33.33 },
    baseline: { total: 6, failed: 5, passRate: 16.67 },
  });
  assert.equal(analysis.total, 6);
  assert.equal(analysis.passed, 4);
  assert.equal(analysis.passRate, 66.67);
  assert.deepEqual(analysis.knownFailureNames, ['known failure']);
  assert.deepEqual(analysis.newFailureNames, ['new failure']);
  assert.equal(analysis.failureChange, -2);
  assert.match(analysis.baselineTrend, /由 5 变为 2/);
});

test('Markdown includes time, stages, analysis and no environment secrets', () => {
  const markdown = renderMarkdown({
    runId: 'run-1',
    startedAtLocal: '2026-07-10 21:30:15',
    finishedAtLocal: '2026-07-10 21:31:15',
    timezone: 'Asia/Shanghai',
    durationMs: 60000,
    git: { branch: 'test/records', commit: 'abc123', clean: true },
    environment: { node: 'v20', npm: '10', playwright: '1', chromium: '149' },
    stages: {
      node: { command: 'npm run test:node', exitCode: 1, durationMs: 1000, stats: { tests: 1, passed: 0, failed: 1, skipped: 0, todo: 0, failureNames: ['known failure'], parsed: true } },
      ui: { command: 'npm run test:ui', exitCode: 0, durationMs: 2000, stats: { tests: 1, passed: 1, failed: 0, skipped: 0, todo: 0, failureNames: [], parsed: true } },
    },
    analysis: { total: 2, passed: 1, failed: 1, passRate: 50, knownFailureNames: ['known failure'], newFailureNames: [], summary: '存在 1 项已知失败，无新增失败。', trend: '无历史记录可比较。' },
    exitCode: 1,
  });
  assert.match(markdown, /2026-07-10 21:30:15/);
  assert.match(markdown, /50\.00%/);
  assert.match(markdown, /known failure/);
  assert.doesNotMatch(markdown, /TOKEN|SECRET|process\.env/);
});
