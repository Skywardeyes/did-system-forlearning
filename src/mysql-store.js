const EMPTY_STATE = { dids: [], credentials: [], verificationLogs: [], disclosureVerificationLogs: [] };
const COLLECTIONS = [
  ['dids', 'dids'], ['credentials', 'credentials'],
  ['verificationLogs', 'verification_logs'], ['disclosureVerificationLogs', 'disclosure_verification_logs'],
];

const parsePayload = (value) => typeof value === 'string' ? JSON.parse(value) : structuredClone(value);

export class MySqlStore {
  constructor(pool, { envelopeCrypto = null } = {}) { this.pool = pool; this.envelopeCrypto = envelopeCrypto; this.transactionQueue = Promise.resolve(); }

  encodeItem(table, id, item) {
    if (!this.envelopeCrypto || !['dids', 'credentials'].includes(table)) return item;
    return { __encrypted: this.envelopeCrypto.encryptJson(item, { recordType: table, recordId: id }) };
  }

  decodeItem(table, id, payload) {
    if (!payload?.__encrypted) return payload;
    if (!this.envelopeCrypto) throw new Error(`Encrypted ${table} data requires envelope crypto`);
    return this.envelopeCrypto.decryptJson(payload.__encrypted, { recordType: table, recordId: id });
  }

  async load(executor = this.pool) {
    const state = structuredClone(EMPTY_STATE);
    for (const [property, table] of COLLECTIONS) {
      const [rows] = await executor.execute(`SELECT payload FROM ${table} ORDER BY position_index, id`);
      state[property] = rows.map((row) => this.decodeItem(table, String(row.id || ''), parsePayload(row.payload)));
    }
    return state;
  }

  async save(state) {
    return this.update((current) => Object.assign(current, structuredClone(state)));
  }

  async update(mutator) {
    const operation = this.transactionQueue.then(async () => {
      const connection = await this.pool.getConnection();
      try {
        await connection.beginTransaction();
        const state = await this.load(connection);
        const result = await mutator(state);
        for (const [property, table] of COLLECTIONS) {
          await connection.execute(`DELETE FROM ${table}`);
          let position = 0;
          for (const item of state[property] || []) {
            const id = String(item.id || item.credentialId || `${property}-${position}`);
            const stored = this.encodeItem(table, id, item);
            await connection.execute(`INSERT INTO ${table} (id, payload, position_index) VALUES (?, CAST(? AS JSON), ?)`, [id, JSON.stringify(stored), position++]);
          }
        }
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally { connection.release(); }
    });
    this.transactionQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async insertKey(row) {
    await this.pool.execute(
      `INSERT INTO kms_keys (key_id, did, key_version, public_jwk, ciphertext, iv, auth_tag, master_key_id, encryption_version, status, created_at)
       VALUES (?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?, ?)`,
      [row.keyId, row.did, row.version, JSON.stringify(row.publicJwk), row.encrypted.ciphertext, row.encrypted.iv, row.encrypted.authTag, row.encrypted.keyId, row.encrypted.encryptionVersion, row.status, row.createdAt],
    );
  }

  async getKey(keyId) {
    const [rows] = await this.pool.execute('SELECT * FROM kms_keys WHERE key_id = ?', [keyId]);
    const row = rows[0];
    if (!row) return null;
    return { keyId: row.key_id, did: row.did, version: row.key_version, publicJwk: parsePayload(row.public_jwk), status: row.status,
      encrypted: { ciphertext: row.ciphertext, iv: row.iv, authTag: row.auth_tag, keyId: row.master_key_id, encryptionVersion: row.encryption_version } };
  }

  async retireKey(keyId) { await this.pool.execute("UPDATE kms_keys SET status = 'retired', retired_at = CURRENT_TIMESTAMP(3) WHERE key_id = ?", [keyId]); }
}
