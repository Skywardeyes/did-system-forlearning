import assert from 'node:assert/strict';
import test from 'node:test';
import { createEnvelopeCrypto } from '../../src/envelope-crypto.js';
import { DidRepository } from '../../src/repositories/did-repository.js';
import { CredentialDisclosureMaterialRepository } from '../../src/repositories/credential-disclosure-material-repository.js';
import { VerificationLogRepository } from '../../src/repositories/verification-log-repository.js';
import { RepositoryConflictError } from '../../src/repositories/repository-errors.js';
import { MySqlUnitOfWork } from '../../src/repositories/unit-of-work.js';
import { assertSupportedSchema } from '../../src/mysql-schema.js';

class RecordingConnection {
  constructor({ affectedRows = 1 } = {}) { this.affectedRows = affectedRows; this.events = []; this.queries = []; }
  async beginTransaction() { this.events.push('BEGIN'); }
  async commit() { this.events.push('COMMIT'); }
  async rollback() { this.events.push('ROLLBACK'); }
  release() { this.events.push('RELEASE'); }
  async execute(sql, params = []) {
    this.queries.push({ sql, params });
    if (/COUNT\(\*\)/.test(sql)) return [[{ total: 0 }]];
    if (/^UPDATE/.test(sql.trim())) return [{ affectedRows: this.affectedRows }];
    return [[]];
  }
}

const context = { tenantId: 'tenant-1', actorId: 'user-1', requestId: 'request-1' };
const did = {
  id: 'did-record-1', tenantId: 'tenant-1', did: 'did:example:record-1', method: 'example', role: 'issuer',
  status: 'active', version: 1, keyVersion: 1, document: { id: 'did:example:record-1' },
  metadata: { displayName: 'Private issuer name' }, createdAt: '2026-07-13T00:00:00.000Z', updatedAt: '2026-07-13T00:00:00.000Z',
};

test('unit of work commits on success and rolls back on failure', async () => {
  const connection = new RecordingConnection();
  const unitOfWork = new MySqlUnitOfWork({ getConnection: async () => connection });
  assert.equal(await unitOfWork.run(context, async ({ context: current }) => current.tenantId), 'tenant-1');
  assert.deepEqual(connection.events, ['BEGIN', 'COMMIT', 'RELEASE']);

  const failed = new RecordingConnection();
  const failingUnitOfWork = new MySqlUnitOfWork({ getConnection: async () => failed });
  await assert.rejects(() => failingUnitOfWork.run(context, async () => { throw new Error('stop'); }), /stop/);
  assert.deepEqual(failed.events, ['BEGIN', 'ROLLBACK', 'RELEASE']);
});

test('DID repository requires tenant context and encrypts metadata before insert', async () => {
  const connection = new RecordingConnection();
  const envelopeCrypto = createEnvelopeCrypto({ keys: new Map([['v1', Buffer.alloc(32, 9)]]), activeKeyId: 'v1' });
  const repository = new DidRepository({ envelopeCrypto });
  await assert.rejects(() => repository.create({ connection, context: {} }, did), { code: 'TENANT_CONTEXT_REQUIRED' });

  await repository.create({ connection, context }, did);
  const insert = connection.queries.at(-1);
  assert.match(insert.sql, /INSERT INTO v2_dids/);
  assert.equal(insert.params[1], 'tenant-1');
  assert.doesNotMatch(JSON.stringify(insert.params), /Private issuer name/);
  assert.match(insert.params[9], /ciphertext/);
});

test('DID repository applies tenant filter, row lock and optimistic version checks', async () => {
  const connection = new RecordingConnection({ affectedRows: 0 });
  const repository = new DidRepository();
  await repository.getForUpdate({ connection, context }, 'did-record-1');
  const locked = connection.queries.at(-1);
  assert.match(locked.sql, /tenant_id = \? FOR UPDATE/);
  assert.deepEqual(locked.params, ['did-record-1', 'tenant-1']);

  await assert.rejects(() => repository.save({ connection, context }, { ...did, metadata: null }, 1), RepositoryConflictError);
  const update = connection.queries.at(-1);
  assert.match(update.sql, /tenant_id = \? AND row_version = \?/);
  assert.deepEqual(update.params.slice(-3), ['did-record-1', 'tenant-1', 1]);
});

test('disclosure material and verification evidence repositories encrypt sensitive data', async () => {
  const connection = new RecordingConnection();
  const envelopeCrypto = createEnvelopeCrypto({ keys: new Map([['v1', Buffer.alloc(32, 9)]]), activeKeyId: 'v1' });
  const materials = new CredentialDisclosureMaterialRepository({ envelopeCrypto });
  await materials.upsert({ connection, context }, {
    credentialId: 'urn:uuid:credential-1', tenantId: 'tenant-1', updatedAt: '2026-07-13T00:00:00.000Z',
    teachingMaterial: { claims: { 'credentialSubject.name': { salt: 'private-salt', value: 'Private name' } } },
    sdJwtMaterial: { issuerJwt: 'private.jwt.signature', disclosures: {} },
  });
  const materialInsert = connection.queries.at(-1);
  assert.match(materialInsert.sql, /v2_credential_disclosure_materials/);
  assert.doesNotMatch(JSON.stringify(materialInsert.params), /Private name|private-salt|private\.jwt/);

  const logs = new VerificationLogRepository({ envelopeCrypto });
  await logs.append({ connection, context }, {
    id: 'log-1', tenantId: 'tenant-1', credentialId: 'urn:uuid:credential-1', verificationKind: 'sd-jwt',
    outcome: 'valid', occurredAt: '2026-07-13T00:00:00.000Z', evidence: { disclosedPaths: ['credentialSubject.course'], rawPresentation: 'sensitive' },
  });
  const logInsert = connection.queries.at(-1);
  assert.match(logInsert.sql, /v2_verification_logs/);
  assert.doesNotMatch(JSON.stringify(logInsert.params), /sensitive|credentialSubject\.course/);
});

test('schema compatibility accepts V1 through V4 during staged repository migration', async () => {
  const poolAt = (version) => ({ execute: async () => [[{ version }]] });
  await assert.doesNotReject(() => assertSupportedSchema(poolAt(1)));
  await assert.doesNotReject(() => assertSupportedSchema(poolAt(2)));
  await assert.doesNotReject(() => assertSupportedSchema(poolAt(3)));
  await assert.doesNotReject(() => assertSupportedSchema(poolAt(4)));
  await assert.rejects(() => assertSupportedSchema(poolAt(3), { requiredVersion: 4 }), { code: 'SCHEMA_VERSION_UNSUPPORTED' });
  await assert.rejects(() => assertSupportedSchema(poolAt(5)), { code: 'SCHEMA_VERSION_UNSUPPORTED' });
});
