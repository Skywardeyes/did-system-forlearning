import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('production entry reports sanitized configuration failures', () => {
  const result = spawnSync(process.execPath, ['src/start.js'], { encoding: 'utf8', env: {} });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /CONFIG_INVALID/);
});
