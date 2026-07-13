import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { loadRuntimeConfig } from './config.js';
import { createEnvelopeCrypto } from './envelope-crypto.js';
import { MySqlLogStore, MySqlStore } from './mysql-store.js';
import { MySqlUnitOfWork } from './repositories/unit-of-work.js';
import { DidRepository } from './repositories/did-repository.js';
import { DidKeyVersionRepository } from './repositories/did-key-version-repository.js';
import { CredentialRepository } from './repositories/credential-repository.js';
import { CredentialStatusEventRepository } from './repositories/credential-status-event-repository.js';
import { CredentialDisclosureMaterialRepository } from './repositories/credential-disclosure-material-repository.js';
import { VerificationLogRepository } from './repositories/verification-log-repository.js';
import { TransactionalLocalKms } from './kms/transactional-local-kms.js';
import { analyzeV1State } from './preflight-v1-migration.js';
import { V2AuditLogStore } from './repositories/v2-audit-log-store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function stableUuid(value) {
  if (uuidPattern.test(String(value))) return String(value);
  const bytes = createHash('sha256').update(String(value)).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class V1ToV2Migrator {
  constructor({ unitOfWork, didRepository, didKeyVersionRepository, credentialRepository, statusEventRepository,
    disclosureMaterialRepository, verificationLogRepository, kms }) {
    this.unitOfWork = unitOfWork; this.didRepository = didRepository; this.didKeyVersionRepository = didKeyVersionRepository;
    this.credentialRepository = credentialRepository; this.statusEventRepository = statusEventRepository;
    this.disclosureMaterialRepository = disclosureMaterialRepository; this.verificationLogRepository = verificationLogRepository; this.kms = kms;
  }

  async migrate(context, state) {
    const analysis = analyzeV1State(state);
    if (!analysis.ready) throw new Error('V1 migration preflight did not pass');
    return this.unitOfWork.run(context, async (operation) => {
      const report = { source: analysis.counts, inserted: { dids: 0, keyVersions: 0, credentials: 0, disclosureMaterials: 0, verificationLogs: 0 }, skipped: { dids: 0, credentials: 0, verificationLogs: 0 } };
      const didMap = new Map();
      for (const source of state.dids || []) {
        let target = await this.didRepository.findByDid(operation, source.did);
        if (target) { report.skipped.dids += 1; didMap.set(source.did, target.id); continue; }
        const createdAt = source.createdAt || new Date().toISOString(); const updatedAt = source.updatedAt || createdAt;
        const record = {
          id: stableUuid(source.id), tenantId: context.tenantId, did: source.did, method: source.method || 'example', role: source.role,
          status: source.status || 'active', version: Number(source.version || 1), keyVersion: Number(source.keyVersion || 1),
          document: structuredClone(source.document), metadata: { name: source.name || '', serviceEndpoint: source.serviceEndpoint || null,
            deactivatedAt: source.deactivatedAt || null, migratedFrom: 'v1' }, createdAt, updatedAt,
        };
        target = await this.didRepository.create(operation, record); report.inserted.dids += 1; didMap.set(source.did, target.id);
        const keys = [...(source.keyHistory || []).map((key) => ({ ...key, status: 'retired' })), {
          version: Number(source.keyVersion || 1), verificationMethod: source.document.assertionMethod[0], publicJwk: source.publicJwk,
          privateJwk: source.privateJwk, status: source.status === 'deactivated' ? 'retired' : 'active', retiredAt: source.deactivatedAt || null,
        }].sort((left, right) => left.version - right.version);
        for (const key of keys) {
          const keyCreatedAt = key.createdAt || createdAt;
          const persisted = await this.kms.persistSigningKey({ connection: operation.connection, did: source.did, version: key.version,
            keyMaterial: { publicJwk: key.publicJwk, privateJwk: key.privateJwk }, createdAt: keyCreatedAt });
          if (key.status === 'retired') await this.kms.retireSigningKey({ connection: operation.connection, keyId: persisted.keyId, retiredAt: key.retiredAt || updatedAt });
          await this.didKeyVersionRepository.create(operation, { id: randomUUID(), didId: target.id, version: key.version,
            kmsKeyId: persisted.keyId, verificationMethod: key.verificationMethod, publicJwk: key.publicJwk,
            status: key.status, createdAt: keyCreatedAt, retiredAt: key.status === 'retired' ? key.retiredAt || updatedAt : null });
          report.inserted.keyVersions += 1;
        }
      }

      for (const source of state.credentials || []) {
        if (await this.credentialRepository.findById(operation, source.id)) { report.skipped.credentials += 1; continue; }
        const credential = source.credential; const issuerDidId = didMap.get(credential.issuer); const holderDidId = didMap.get(credential.credentialSubject.id);
        const record = await this.credentialRepository.create(operation, {
          id: source.id, tenantId: context.tenantId, issuerDidId, holderDidId, status: source.status || 'active',
          validFrom: credential.validFrom, validUntil: credential.validUntil, issuedAt: source.issuedAt || credential.proof?.created || credential.validFrom,
          suspendedAt: source.suspendedAt || null, resumedAt: source.resumedAt || null, revokedAt: source.revokedAt || null,
          replacedAt: source.replacedAt || null, replacesCredentialId: source.replaces || null,
          replacedByCredentialId: source.replacedBy || null, credential: structuredClone(credential),
        });
        report.inserted.credentials += 1;
        await this.statusEventRepository.append(operation, { id: randomUUID(), tenantId: context.tenantId, credentialId: record.id,
          fromStatus: null, toStatus: record.status, actorId: context.actorId, reason: 'migrated-from-v1', occurredAt: record.issuedAt });
        if (source.disclosureMaterial || source.sdJwtMaterial) {
          await this.disclosureMaterialRepository.upsert(operation, { credentialId: source.id, tenantId: context.tenantId,
            teachingMaterial: source.disclosureMaterial || null, sdJwtMaterial: source.sdJwtMaterial || null, updatedAt: record.issuedAt });
          report.inserted.disclosureMaterials += 1;
        }
      }

      const logs = [
        ...(state.verificationLogs || []).map((entry) => ({ ...entry, kind: 'credential' })),
        ...(state.disclosureVerificationLogs || []).map((entry) => ({ ...entry, kind: entry.format || 'teaching-disclosure' })),
      ];
      for (const source of logs) {
        const id = stableUuid(source.id || `${source.kind}:${source.credentialId}:${source.checkedAt}`);
        if (await this.verificationLogRepository.findById(operation, id)) { report.skipped.verificationLogs += 1; continue; }
        await this.verificationLogRepository.append(operation, { id, tenantId: context.tenantId, credentialId: source.credentialId || null,
          verificationKind: source.kind, outcome: source.valid ? 'valid' : 'invalid', occurredAt: source.checkedAt || new Date().toISOString(),
          evidence: { migratedFrom: 'v1', failedChecks: source.failedChecks || [], disclosedPaths: source.disclosedPaths || [] } });
        report.inserted.verificationLogs += 1;
      }
      return report;
    });
  }
}

async function main() {
  const config = loadRuntimeConfig(process.env);
  const pool = mysql.createPool({ ...config.database, ssl: config.database.ssl ? {} : undefined, connectionLimit: 2 });
  try {
    const envelopeCrypto = createEnvelopeCrypto({ keys: new Map([[config.kms.activeKeyId, config.kms.masterKey]]), activeKeyId: config.kms.activeKeyId });
    const [admins] = await pool.execute(
      `SELECT memberships.tenant_id, memberships.user_id FROM v2_memberships AS memberships
       INNER JOIN v2_organizations AS organizations ON organizations.id = memberships.tenant_id
       INNER JOIN v2_users AS users ON users.id = memberships.user_id
       WHERE organizations.name = ? AND users.external_subject = ? AND memberships.role_code = 'tenant_admin' AND memberships.status = 'active' LIMIT 1`,
      [process.env.BOOTSTRAP_ORG_NAME || '本地演示组织', process.env.BOOTSTRAP_ADMIN_SUBJECT || 'local-admin'],
    );
    if (!admins[0]) throw new Error('Seeded tenant administrator was not found');
    const state = await new MySqlStore(pool, { envelopeCrypto }).load();
    const migrator = new V1ToV2Migrator({ unitOfWork: new MySqlUnitOfWork(pool), didRepository: new DidRepository({ envelopeCrypto }),
      didKeyVersionRepository: new DidKeyVersionRepository(), credentialRepository: new CredentialRepository({ envelopeCrypto }),
      statusEventRepository: new CredentialStatusEventRepository(), disclosureMaterialRepository: new CredentialDisclosureMaterialRepository({ envelopeCrypto }),
      verificationLogRepository: new VerificationLogRepository({ envelopeCrypto }), kms: new TransactionalLocalKms(envelopeCrypto) });
    const report = await migrator.migrate({ tenantId: admins[0].tenant_id, actorId: admins[0].user_id, requestId: randomUUID() }, state);
    const legacyAuditLogs = await new MySqlLogStore(pool).load();
    const v2AuditLogStore = new V2AuditLogStore(pool, { envelopeCrypto });
    for (const entry of legacyAuditLogs) {
      await v2AuditLogStore.append({ ...entry, id: stableUuid(entry.id), correlationId: stableUuid(entry.correlationId || entry.id) });
    }
    const completedAt = new Date().toISOString(); const output = { migration: 'v1-to-v2', completedAt, ...report };
    output.auditLogsProcessed = legacyAuditLogs.length;
    const reportDirectory = path.join(root, '.test-data', 'migrations'); await mkdir(reportDirectory, { recursive: true });
    const reportPath = path.join(reportDirectory, `v1-to-v2-${completedAt.replace(/[:.]/g, '-')}.json`);
    await writeFile(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify({ ...output, reportPath: path.relative(root, reportPath) }, null, 2)}\n`);
  } finally { await pool.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`V1 to V2 migration failed: ${error.code || error.message}\n`); process.exitCode = 1; });
}
