import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runRecordedTests } from '../run-recorded-tests.js';

const nodeSuccess = `console.log('1..1\\n# tests 1\\n# pass 1\\n# fail 0\\n# skipped 0\\n# todo 0')`;
const nodeFailure = `console.log('not ok 1 - known failure\\n1..1\\n# tests 1\\n# pass 0\\n# fail 1\\n# skipped 0\\n# todo 0'); process.exit(1)`;
const uiSuccess = `console.log('  2 passed (1s)')`;

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'test-record-runner-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('successful run creates logs, metadata and Markdown', async (t) => {
  const root = await fixture(t);
  const result = await runRecordedTests({
    recordRoot: root,
    now: () => new Date('2026-07-10T13:30:15.000Z'),
    stages: [
      { key: 'node', command: process.execPath, args: ['-e', nodeSuccess] },
      { key: 'ui', command: process.execPath, args: ['-e', uiSuccess] },
    ],
    knownFailures: [],
    quiet: true,
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual((await readdir(result.runPath)).sort(), ['metadata.json', 'node.log', 'result.md', 'ui.log']);
  const metadata = JSON.parse(await readFile(path.join(result.runPath, 'metadata.json'), 'utf8'));
  assert.equal(metadata.startedAtLocal, '2026-07-10 21:30:15');
  assert.equal(metadata.analysis.total, 3);
  assert.match(await readFile(path.join(result.runPath, 'result.md'), 'utf8'), /100\.00%/);
});

test('Node failure still runs UI and preserves nonzero result', async (t) => {
  const root = await fixture(t);
  const result = await runRecordedTests({
    recordRoot: root,
    stages: [
      { key: 'node', command: process.execPath, args: ['-e', nodeFailure] },
      { key: 'ui', command: process.execPath, args: ['-e', uiSuccess] },
    ],
    knownFailures: ['known failure'],
    quiet: true,
  });
  assert.equal(result.exitCode, 1);
  assert.match(await readFile(path.join(result.runPath, 'ui.log'), 'utf8'), /2 passed/);
  assert.deepEqual(result.metadata.analysis.knownFailureNames, ['known failure']);
});

test('same-second runs get unique directories and never overwrite', async (t) => {
  const root = await fixture(t);
  const options = {
    recordRoot: root,
    now: () => new Date('2026-07-10T13:30:15.000Z'),
    stages: [
      { key: 'node', command: process.execPath, args: ['-e', nodeSuccess] },
      { key: 'ui', command: process.execPath, args: ['-e', uiSuccess] },
    ],
    quiet: true,
  };
  const first = await runRecordedTests(options);
  const second = await runRecordedTests(options);
  assert.notEqual(first.runPath, second.runPath);
});
