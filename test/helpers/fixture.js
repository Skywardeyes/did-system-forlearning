import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../../src/store.js';
import { LogStore } from '../../src/log-store.js';
import { LogService } from '../../src/log-service.js';
import { VcService } from '../../src/vc-service.js';
import { createAppServer } from '../../src/server.js';

export async function createFixture(t, { logLimit = 5000 } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'did-vc-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new JsonStore(path.join(directory, 'store.json'));
  const logStore = new LogStore(path.join(directory, 'logs.json'), { limit: logLimit });
  const logService = new LogService(logStore);
  const service = new VcService(store);
  return { directory, store, logStore, logService, service };
}

export async function startTestApp(t, options = {}) {
  const fixture = await createFixture(t, options);
  const server = createAppServer(fixture.service, { logService: fixture.logService });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { ...fixture, server, url: `http://127.0.0.1:${server.address().port}` };
}

export async function createDidPair(service, { issuerMethod = 'example', holderMethod = 'example' } = {}) {
  const issuer = await service.createDid({ name: '?????', role: 'issuer', method: issuerMethod });
  const holder = await service.createDid({ name: '????', role: 'holder', method: holderMethod });
  return { issuer, holder };
}

export async function issueValidCredential(service, issuer, holder, overrides = {}) {
  return service.issueCredential({
    issuerDid: issuer.did,
    holderDid: holder.did,
    studentName: '????',
    courseName: 'DID ? VC ?????',
    completionDate: '2026-07-10',
    validUntil: '2099-12-31T23:59:59.000Z',
    ...overrides,
  });
}

export async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  return { response, body };
}
