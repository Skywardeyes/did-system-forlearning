import mysql from 'mysql2/promise';
import { loadRuntimeConfig } from './config.js';
import { createEnvelopeCrypto } from './envelope-crypto.js';
import { MySqlLogStore, MySqlStore } from './mysql-store.js';
import { assertSupportedSchema } from './mysql-schema.js';
import { LocalKms } from './local-kms.js';
import { LogService } from './log-service.js';
import { VcService } from './vc-service.js';
import { createAppServer } from './server.js';

export async function bootstrap(env = process.env, { createPool = mysql.createPool } = {}) {
  const config = loadRuntimeConfig(env);
  const pool = createPool({ ...config.database, ssl: config.database.ssl ? {} : undefined, connectionLimit: 5 });
  try {
    await pool.execute('SELECT 1');
    await assertSupportedSchema(pool);
    const envelopeCrypto = createEnvelopeCrypto({ keys: new Map([[config.kms.activeKeyId, config.kms.masterKey]]), activeKeyId: config.kms.activeKeyId });
    const store = new MySqlStore(pool, { envelopeCrypto });
    const kms = new LocalKms(store, envelopeCrypto);
    const logService = new LogService(new MySqlLogStore(pool));
    const service = new VcService(store, undefined, { kms });
    return { server: createAppServer(service, { logService }), pool };
  } catch {
    await pool.end?.().catch(() => {});
    const error = new Error('Unable to initialize the configured MySQL database');
    error.code = 'DATABASE_UNAVAILABLE';
    throw error;
  }
}
