import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { loadRuntimeConfig } from './config.js';
import { createEnvelopeCrypto } from './envelope-crypto.js';
import { MySqlStore } from './mysql-store.js';
import { MySqlUnitOfWork } from './repositories/unit-of-work.js';
import { DidRepository } from './repositories/did-repository.js';
import { DidKeyVersionRepository } from './repositories/did-key-version-repository.js';
import { CredentialRepository } from './repositories/credential-repository.js';
import { CredentialDisclosureMaterialRepository } from './repositories/credential-disclosure-material-repository.js';
import { stableStringify, verifyCredentialSignature } from './crypto.js';

const parseJson = (value) => typeof value === 'string' ? JSON.parse(value) : value;

export function compareFields(kind, id, fields) {
  return Object.entries(fields).flatMap(([field, values]) => stableStringify(values[0]) === stableStringify(values[1])
    ? [] : [{ kind, id, field }]);
}

export async function reconcile(context, state, { pool, unitOfWork, didRepository, didKeyVersionRepository, credentialRepository, disclosureMaterialRepository }) {
  return unitOfWork.run(context, async (operation) => {
    const mismatches = []; let signatureChecks = 0; let signaturePassed = 0; let encryptedAtRest = true;
    for (const source of state.dids || []) {
      const target = await didRepository.findByDid(operation, source.did);
      if (!target) { mismatches.push({ kind: 'did', id: source.id, field: 'missing' }); continue; }
      mismatches.push(...compareFields('did', source.id, {
        did: [source.did, target.did], role: [source.role, target.role], status: [source.status || 'active', target.status],
        version: [Number(source.version || 1), target.version], keyVersion: [Number(source.keyVersion || 1), target.keyVersion],
        document: [source.document, target.document],
      }));
    }
    for (const source of state.credentials || []) {
      const target = await credentialRepository.findById(operation, source.id);
      if (!target) { mismatches.push({ kind: 'credential', id: source.id, field: 'missing' }); continue; }
      mismatches.push(...compareFields('credential', source.id, {
        credential: [source.credential, target.credential], status: [source.status || 'active', target.status],
        replaces: [source.replaces || null, target.replacesCredentialId], replacedBy: [source.replacedBy || null, target.replacedByCredentialId],
      }));
      const issuer = await didRepository.findByDid(operation, source.credential.issuer);
      const keyVersion = Number(source.credential.proof?.keyVersion || 1);
      const key = issuer && await didKeyVersionRepository.findByDidVersion(operation, issuer.id, keyVersion);
      signatureChecks += 1;
      try { if (key && verifyCredentialSignature(target.credential, key.publicJwk)) signaturePassed += 1; } catch { /* reported below */ }
      const material = await disclosureMaterialRepository.findByCredentialId(operation, source.id);
      if (Boolean(source.disclosureMaterial) !== Boolean(material?.teachingMaterial)) mismatches.push({ kind: 'credential', id: source.id, field: 'teachingMaterial' });
      if (Boolean(source.sdJwtMaterial) !== Boolean(material?.sdJwtMaterial)) mismatches.push({ kind: 'credential', id: source.id, field: 'sdJwtMaterial' });
    }
    if (signatureChecks !== signaturePassed) mismatches.push({ kind: 'signature', id: null, field: `${signaturePassed}/${signatureChecks}` });

    const credentialIds = (state.credentials || []).map((item) => item.id);
    if (credentialIds.length) {
      const placeholders = credentialIds.map(() => '?').join(',');
      const [rawCredentials] = await pool.execute(`SELECT id, encrypted_payload FROM v2_credentials WHERE id IN (${placeholders})`, credentialIds);
      for (const row of rawCredentials) {
        const envelope = parseJson(row.encrypted_payload);
        if (!envelope?.ciphertext || envelope.credential || envelope.proof) encryptedAtRest = false;
      }
      const [rawMaterials] = await pool.execute(`SELECT credential_id, encrypted_teaching_material, encrypted_sd_jwt_material FROM v2_credential_disclosure_materials WHERE credential_id IN (${placeholders})`, credentialIds);
      for (const row of rawMaterials) {
        for (const value of [row.encrypted_teaching_material, row.encrypted_sd_jwt_material]) {
          const envelope = value == null ? null : parseJson(value);
          if (envelope && (!envelope.ciphertext || envelope.claims || envelope.disclosures)) encryptedAtRest = false;
        }
      }
    }
    if (!encryptedAtRest) mismatches.push({ kind: 'encryption', id: null, field: 'plaintext-at-rest' });
    return {
      matched: mismatches.length === 0, sourceCounts: { dids: state.dids?.length || 0, credentials: state.credentials?.length || 0 },
      signatureChecks: { passed: signaturePassed, total: signatureChecks }, encryptedAtRest, mismatches,
    };
  });
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
    const result = await reconcile({ tenantId: admins[0].tenant_id, actorId: admins[0].user_id, requestId: randomUUID() }, state, {
      pool, unitOfWork: new MySqlUnitOfWork(pool), didRepository: new DidRepository({ envelopeCrypto }),
      didKeyVersionRepository: new DidKeyVersionRepository(), credentialRepository: new CredentialRepository({ envelopeCrypto }),
      disclosureMaterialRepository: new CredentialDisclosureMaterialRepository({ envelopeCrypto }),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.matched) process.exitCode = 1;
  } finally { await pool.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`V1/V2 reconciliation failed: ${error.code || error.message}\n`); process.exitCode = 1; });
}
