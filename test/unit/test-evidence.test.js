import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildEvidenceManifest, verifyEvidenceManifest } from '../helpers/test-evidence.js';

test('evidence manifest detects unchanged, modified, missing and extra files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evidence-'));
  await mkdir(path.join(root, 'nested')); await writeFile(path.join(root, 'a.log'), 'alpha'); await writeFile(path.join(root, 'nested', 'b.json'), '{}');
  const manifest = await buildEvidenceManifest(root);
  assert.equal(manifest.files.length, 2);
  assert.equal((await verifyEvidenceManifest(root, manifest)).valid, true);
  await writeFile(path.join(root, 'a.log'), 'changed');
  const changed = await verifyEvidenceManifest(root, manifest); assert.equal(changed.valid, false); assert.deepEqual(changed.modified, ['a.log']);
  await writeFile(path.join(root, 'extra.txt'), 'extra');
  const extra = await verifyEvidenceManifest(root, manifest); assert.ok(extra.extra.includes('extra.txt'));
});
