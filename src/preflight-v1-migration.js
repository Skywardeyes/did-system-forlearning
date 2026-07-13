import mysql from 'mysql2/promise';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRuntimeConfig } from './config.js';
import { createEnvelopeCrypto } from './envelope-crypto.js';
import { MySqlStore } from './mysql-store.js';

export function analyzeV1State(state) {
  const didValues = new Set((state.dids || []).map((item) => item.did));
  const didIssues = (state.dids || []).flatMap((item) => {
    const missing = ['id', 'did', 'role', 'document', 'publicJwk', 'privateJwk'].filter((field) => !item?.[field]);
    if ((item?.keyHistory || []).some((key) => !key.publicJwk || !key.privateJwk || !key.version)) missing.push('keyHistory');
    return missing.length ? [{ id: item?.id || null, missing }] : [];
  });
  const credentialIssues = (state.credentials || []).flatMap((item) => {
    const missing = [];
    if (!item?.id || !item?.credential) missing.push('credential');
    if (!didValues.has(item?.credential?.issuer)) missing.push('issuer');
    if (!didValues.has(item?.credential?.credentialSubject?.id)) missing.push('holder');
    return missing.length ? [{ id: item?.id || null, missing }] : [];
  });
  return {
    counts: {
      dids: state.dids?.length || 0, credentials: state.credentials?.length || 0,
      verificationLogs: state.verificationLogs?.length || 0,
      disclosureVerificationLogs: state.disclosureVerificationLogs?.length || 0,
    },
    methods: Object.fromEntries([...new Set((state.dids || []).map((item) => item.method || 'example'))].sort().map((method) => [method,
      state.dids.filter((item) => (item.method || 'example') === method).length])),
    didIssues, credentialIssues,
    ready: didIssues.length === 0 && credentialIssues.length === 0,
  };
}

async function main() {
  const config = loadRuntimeConfig(process.env);
  const pool = mysql.createPool({ ...config.database, ssl: config.database.ssl ? {} : undefined, connectionLimit: 1 });
  try {
    const envelopeCrypto = createEnvelopeCrypto({ keys: new Map([[config.kms.activeKeyId, config.kms.masterKey]]), activeKeyId: config.kms.activeKeyId });
    const state = await new MySqlStore(pool, { envelopeCrypto }).load();
    const analysis = analyzeV1State(state);
    const [v2Counts] = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM v2_dids) AS dids,
        (SELECT COUNT(*) FROM v2_credentials) AS credentials,
        (SELECT COUNT(*) FROM v2_verification_logs) AS verification_logs`,
    );
    process.stdout.write(`${JSON.stringify({ source: analysis, target: v2Counts[0] }, null, 2)}\n`);
    if (!analysis.ready) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`V1 migration preflight failed: ${error.code || 'DATABASE_ERROR'}\n`);
    process.exitCode = 1;
  });
}
