import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createFixture } from '../helpers/fixture.js';
import { publicDid } from '../../src/store.js';

test('JSON store initializes and persists isolated state', async (t) => {
  const { directory, store } = await createFixture(t);
  assert.deepEqual(await store.load(), { dids: [], credentials: [], verificationLogs: [], disclosureVerificationLogs: [] });
  const state = { dids: [{ id: '1' }], credentials: [], verificationLogs: [] };
  await store.save(state);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'store.json'), 'utf8')), state);
});

test('JSON store rejects malformed persisted JSON', async (t) => {
  const { directory, store } = await createFixture(t);
  await writeFile(path.join(directory, 'store.json'), '{broken', 'utf8');
  await assert.rejects(() => store.load(), SyntaxError);
});

test('public DID projection removes current and historical private keys', () => {
  const projected = publicDid({ id: '1', privateJwk: { d: 'current' }, keyHistory: [{ version: 1, privateJwk: { d: 'old' }, publicJwk: { x: 'safe' } }] });
  assert.equal('privateJwk' in projected, false);
  assert.equal('privateJwk' in projected.keyHistory[0], false);
  assert.deepEqual(projected.keyHistory[0].publicJwk, { x: 'safe' });
});

test('concurrent service writes preserve both identities', async (t) => {
  const { service } = await createFixture(t);
  await Promise.all([
    service.createDid({ name: 'Issuer A', role: 'issuer' }),
    service.createDid({ name: 'Issuer B', role: 'issuer' }),
  ]);
  assert.equal((await service.getState()).dids.length, 2);
});
