# MySQL Application Encryption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace production JSON persistence with local MySQL and protect private keys, VC claims, and disclosure material with AES-256-GCM behind a software KMS boundary.

**Architecture:** Production startup constructs a validated configuration, a `mysql2/promise` connection pool, a schema-versioned `MySqlStore`, and a `LocalKms`. The store preserves the current transactional `load/update` service contract while mapping state collections to normalized tables and encrypting sensitive business fields; signing operations move behind `LocalKms.sign(keyId, payload)` so API and service results never expose private keys.

**Tech Stack:** Node.js 20+, ESM, built-in `node:crypto`, `mysql2` promise API, Node test runner, Playwright.

## Global Constraints

- Use AES-256-GCM with a fresh 12-byte random IV for every encryption.
- `KMS_MASTER_KEY` is Base64 and must decode to exactly 32 bytes.
- Never store the master key in MySQL, source control, logs, test evidence, or API responses.
- Production startup must fail on missing configuration, invalid key, connection failure, or unsupported schema; never fall back to JSON.
- Preserve existing DID/VC lifecycle, search, pagination, audit, selective-disclosure, and SD-JWT behavior.
- Existing JSON data is not automatically migrated.
- Tests use isolated in-memory stores unless a test explicitly targets the MySQL adapter.

---

## File Structure

- Create `src/config.js`: validate database and KMS environment variables.
- Create `src/envelope-crypto.js`: AES-GCM envelope serialization and authentication.
- Create `src/local-kms.js`: key generation, encrypted private-key persistence, signing, and rotation boundary.
- Create `src/mysql-store.js`: MySQL-backed state and audit persistence.
- Create `src/mysql-schema.js`: supported schema version and migration runner.
- Create `database/001-initial.sql`: initial MySQL tables and indexes.
- Create `.env.example`: blank database and master-key configuration template.
- Modify `src/server.js`: asynchronous production bootstrap with no JSON fallback.
- Modify `src/vc-service.js`: store `keyId`, request signatures through KMS, and stop retaining private JWKs in DID objects.
- Modify `src/crypto.js`: expose payload-byte helpers while retaining public verification.
- Modify `src/store.js`: retain public projections and rename JSON implementation as test/legacy-only.
- Modify `test/helpers/fixture.js`: inject deterministic test KMS and memory stores.
- Add focused unit, integration, security, API, and regression tests described below.

---

### Task 1: Strict Runtime Configuration

**Files:**
- Create: `src/config.js`
- Create: `.env.example`
- Create: `test/unit/config.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `loadRuntimeConfig(env = process.env) -> { database, kms }`.
- Produces: `ConfigurationError` with `code === 'CONFIG_INVALID'`.

- [ ] **Step 1: Write failing configuration tests**

```js
test('rejects missing database configuration', () => {
  assert.throws(() => loadRuntimeConfig({}), (error) =>
    error.code === 'CONFIG_INVALID' && /DB_HOST/.test(error.message));
});

test('rejects a master key that is not 32 bytes', () => {
  assert.throws(() => loadRuntimeConfig(validEnv({ KMS_MASTER_KEY: Buffer.alloc(31).toString('base64') })), /32 bytes/);
});

test('returns sanitized typed configuration', () => {
  const config = loadRuntimeConfig(validEnv());
  assert.equal(config.database.port, 3306);
  assert.equal(config.database.password, 'secret');
  assert.equal(config.kms.masterKey.length, 32);
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `node --test test/unit/config.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/config.js`.

- [ ] **Step 3: Implement strict parsing**

Implement `loadRuntimeConfig` to validate `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `KMS_MASTER_KEY`, integer port range, `DB_SSL === 'true'`, and default `KMS_MASTER_KEY_ID` to `local-master-v1`. Error messages list configuration names but never values.

Add `mysql2` to runtime dependencies with `npm install mysql2` and create `.env.example` exactly as specified in the approved design.

- [ ] **Step 4: Verify**

Run: `node --test test/unit/config.test.js`

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json .env.example src/config.js test/unit/config.test.js
git commit -m "feat: validate mysql and kms configuration"
```

---

### Task 2: Authenticated Envelope Encryption

**Files:**
- Create: `src/envelope-crypto.js`
- Create: `test/unit/envelope-crypto.test.js`

**Interfaces:**
- Produces: `createEnvelopeCrypto({ keys, activeKeyId })`.
- Produces: `encryptJson(value, { recordType, recordId }) -> { ciphertext, iv, authTag, keyId, encryptionVersion: 1 }`.
- Produces: `decryptJson(envelope, { recordType, recordId }) -> unknown`.
- Throws: `EncryptedDataError` with `code === 'ENCRYPTED_DATA_INVALID'`.

- [ ] **Step 1: Write failing crypto tests**

```js
test('round trips JSON with record-bound authentication', () => {
  const crypto = fixtureCrypto();
  const encrypted = crypto.encryptJson({ d: 'private' }, { recordType: 'kms-key', recordId: 'key-1' });
  assert.deepEqual(crypto.decryptJson(encrypted, { recordType: 'kms-key', recordId: 'key-1' }), { d: 'private' });
});

test('uses a fresh IV for identical plaintext', () => {
  const crypto = fixtureCrypto();
  const a = crypto.encryptJson({ name: 'Alice' }, context);
  const b = crypto.encryptJson({ name: 'Alice' }, context);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
});

test('rejects ciphertext moved to another record', () => {
  const encrypted = fixtureCrypto().encryptJson({ d: 'private' }, { recordType: 'kms-key', recordId: 'key-1' });
  assert.throws(() => fixtureCrypto().decryptJson(encrypted, { recordType: 'kms-key', recordId: 'key-2' }), { code: 'ENCRYPTED_DATA_INVALID' });
});
```

- [ ] **Step 2: Confirm tests fail**

Run: `node --test test/unit/envelope-crypto.test.js`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement AES-256-GCM**

Use `randomBytes(12)`, `createCipheriv('aes-256-gcm', key, iv)`, and AAD encoded from `JSON.stringify({ recordType, recordId, encryptionVersion: 1 })`. Store all binary values as Base64. Wrap authentication and envelope-validation errors without including plaintext or key material.

- [ ] **Step 4: Verify**

Run: `node --test test/unit/envelope-crypto.test.js`

Expected: all tests pass, including single-byte tampering of ciphertext, IV, tag, and AAD.

- [ ] **Step 5: Commit**

```powershell
git add src/envelope-crypto.js test/unit/envelope-crypto.test.js
git commit -m "feat: add authenticated field encryption"
```

---

### Task 3: Software KMS Boundary

**Files:**
- Create: `src/local-kms.js`
- Create: `test/unit/local-kms.test.js`
- Modify: `src/crypto.js`

**Interfaces:**
- Consumes: envelope crypto from Task 2 and a repository with `insertKey`, `getKey`, `retireKey`.
- Produces: `LocalKms.generateSigningKey({ did, version }) -> { keyId, publicJwk, verificationMethod }`.
- Produces: `LocalKms.sign(keyId, payload) -> base64url signature`.
- Produces: `LocalKms.rotateSigningKey(currentKeyId, metadata) -> public key result`.
- Does not produce any private-key export method.

- [ ] **Step 1: Write failing KMS tests**

```js
test('persists only encrypted private material', async () => {
  const result = await kms.generateSigningKey({ did: 'did:example:1', version: 1 });
  const row = repository.rows.get(result.keyId);
  assert.equal(JSON.stringify(row).includes('"d"'), false);
  assert.equal('privateJwk' in result, false);
});

test('signs without exposing the private key', async () => {
  const key = await kms.generateSigningKey({ did: 'did:example:1', version: 1 });
  const signature = await kms.sign(key.keyId, { hello: 'world' });
  assert.equal(verifyPayload({ hello: 'world' }, signature, key.publicJwk), true);
});
```

- [ ] **Step 2: Confirm tests fail**

Run: `node --test test/unit/local-kms.test.js`

Expected: FAIL because `LocalKms` does not exist.

- [ ] **Step 3: Implement the KMS**

Refactor `src/crypto.js` so key generation and Ed25519 signing primitives can be used internally by `LocalKms`. Encrypt private JWK immediately with record type `kms-key` and `keyId`; decrypt only inside `sign`; overwrite the local reference in `finally`. Return public key material only.

- [ ] **Step 4: Verify**

Run: `node --test test/unit/local-kms.test.js test/unit/crypto.test.js`

Expected: all KMS and existing crypto tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/local-kms.js src/crypto.js test/unit/local-kms.test.js test/unit/crypto.test.js
git commit -m "feat: isolate signing keys behind local kms"
```

---

### Task 4: Versioned MySQL Schema and Adapter

**Files:**
- Create: `database/001-initial.sql`
- Create: `src/mysql-schema.js`
- Create: `src/mysql-store.js`
- Create: `test/integration/mysql-store.test.js`
- Create: `test/helpers/fake-mysql.js`

**Interfaces:**
- Produces: `initializeSchema(pool)`, `assertSupportedSchema(pool)`.
- Produces: `MySqlStore.load()`, `save(state)`, `update(mutator)` matching the existing store contract.
- Produces KMS repository methods `insertKey`, `getKey`, and `retireKey`.

- [ ] **Step 1: Add failing schema/adapter tests**

Test that initialization creates version `1`, unsupported versions throw `SCHEMA_VERSION_UNSUPPORTED`, `update` opens a transaction and rolls back on error, and KMS rows retain ciphertext fields but contain no private JWK plaintext.

```js
await store.update((state) => { state.dids.push({ id: 'did-1' }); });
assert.deepEqual((await store.load()).dids.map(({ id }) => id), ['did-1']);
assert.equal(fakePool.events.includes('COMMIT'), true);
```

- [ ] **Step 2: Confirm tests fail**

Run: `node --test test/integration/mysql-store.test.js`

Expected: FAIL because MySQL schema modules do not exist.

- [ ] **Step 3: Add schema and adapter**

Create the seven approved tables using `utf8mb4`, InnoDB, foreign keys, unique IDs, status/time indexes, and encrypted columns (`ciphertext`, `iv`, `auth_tag`, `master_key_id`, `encryption_version`). Use parameterized SQL exclusively. Serialize public complex values into JSON columns; call envelope crypto before persisting credential claims and disclosure material.

- [ ] **Step 4: Verify adapter behavior**

Run: `node --test test/integration/mysql-store.test.js test/security/injection-and-traversal.test.js`

Expected: tests pass and fake-pool query assertions show placeholders rather than interpolated input.

- [ ] **Step 5: Commit**

```powershell
git add database/001-initial.sql src/mysql-schema.js src/mysql-store.js test/integration/mysql-store.test.js test/helpers/fake-mysql.js
git commit -m "feat: add versioned mysql persistence"
```

---

### Task 5: Integrate KMS with DID and VC Lifecycles

**Files:**
- Modify: `src/vc-service.js`
- Modify: `src/did-methods.js`
- Modify: `src/store.js`
- Modify: `test/helpers/fixture.js`
- Modify: `test/did-lifecycle.test.js`
- Modify: `test/vc-service.test.js`
- Modify: `test/integration/selective-disclosure.test.js`

**Interfaces:**
- Consumes: `VcService(store, registry, { kms, logService, correlationId })`.
- DID records contain `keyId` and public JWK, never `privateJwk`.
- Signing paths call `await kms.sign(keyId, payload)`.

- [ ] **Step 1: Change fixture tests to demand a KMS**

Add assertions that created and rotated DID records contain `keyId`, contain no current or historical `privateJwk`, issued credentials still verify, and old credentials verify after rotation.

- [ ] **Step 2: Run focused lifecycle tests**

Run: `node --test test/did-lifecycle.test.js test/vc-service.test.js test/integration/selective-disclosure.test.js`

Expected: FAIL because the service still stores and consumes `privateJwk`.

- [ ] **Step 3: Refactor lifecycle operations**

Inject KMS through `VcService`, make DID creation and rotation asynchronous where necessary, store retired `keyId` in `keyHistory`, and replace direct calls to `signCredential`, `signPayload`, and `signCompactJwt` with KMS signing calls. Keep public verification functions unchanged. Update the in-memory test fixture to use real envelope crypto with a deterministic 32-byte test master key and an in-memory KMS-key repository.

- [ ] **Step 4: Run lifecycle and disclosure suites**

Run: `node --test test/did-lifecycle.test.js test/vc-service.test.js test/integration/selective-disclosure.test.js test/api/selective-disclosure.test.js`

Expected: all pass and serialized service state contains no `privateJwk`.

- [ ] **Step 5: Commit**

```powershell
git add src/vc-service.js src/did-methods.js src/store.js test/helpers/fixture.js test/did-lifecycle.test.js test/vc-service.test.js test/integration/selective-disclosure.test.js
git commit -m "refactor: route did and vc signing through kms"
```

---

### Task 6: Production Bootstrap Without JSON Fallback

**Files:**
- Modify: `src/server.js`
- Create: `src/bootstrap.js`
- Create: `test/integration/bootstrap.test.js`
- Modify: `README.md`

**Interfaces:**
- Produces: `bootstrap(env = process.env) -> { server, pool }`.
- `src/server.js` calls bootstrap only when executed as the entry point; importing `createAppServer` remains side-effect free for tests.

- [ ] **Step 1: Write failing bootstrap tests**

```js
await assert.rejects(() => bootstrap({}), { code: 'CONFIG_INVALID' });
await assert.rejects(() => bootstrap(validEnv(), { createPool: rejectingPool }), { code: 'DATABASE_UNAVAILABLE' });
```

Assert captured error output does not contain database password or master key.

- [ ] **Step 2: Confirm failure**

Run: `node --test test/integration/bootstrap.test.js`

Expected: FAIL because `bootstrap` does not exist.

- [ ] **Step 3: Implement asynchronous bootstrap**

Load strict configuration, construct `mysql2/promise` pool, verify connectivity with `SELECT 1`, assert schema version, create envelope crypto, `MySqlStore`, `LocalKms`, `VcService`, and `LogService`, then return the HTTP server. On entry-point failure, print only sanitized code/message, set nonzero exit status, and do not create JSON files.

Document MySQL creation, running `database/001-initial.sql`, generating the master key with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, setting environment variables, and starting the app.

- [ ] **Step 4: Verify**

Run: `node --test test/integration/bootstrap.test.js test/http-api.test.js`

Expected: tests pass; importing `server.js` does not attempt a database connection.

- [ ] **Step 5: Commit**

```powershell
git add src/server.js src/bootstrap.js test/integration/bootstrap.test.js README.md
git commit -m "feat: require mysql encryption configuration at startup"
```

---

### Task 7: Security and Full Regression Verification

**Files:**
- Modify: `test/security/data-exposure.test.js`
- Create: `test/security/encrypted-persistence.test.js`
- Modify: `test/unit/log-redaction.test.js`
- Modify: `docs/测试与人工验收.md`

**Interfaces:**
- Consumes all production behavior from Tasks 1–6.
- Produces executable evidence that plaintext secrets do not reach persistence, APIs, or logs.

- [ ] **Step 1: Add end-to-end security assertions**

Create a credential containing unique sentinels such as `PRIVATE-STUDENT-7F29`, inspect captured SQL parameters/rows, and assert that neither private JWK `d` values nor sensitive claim/disclosure sentinels occur. Tamper with ciphertext and assert `ENCRYPTED_DATA_INVALID`. Assert APIs and logs remain redacted.

- [ ] **Step 2: Run security suite**

Run: `npm run test:security`

Expected: all security tests pass.

- [ ] **Step 3: Run complete Node regression**

Run: `npm run test:node`

Expected: exit code 0 with every Node test passing.

- [ ] **Step 4: Run UI regression**

Run: `npm run test:ui`

Expected: exit code 0 with all Chromium tests passing.

- [ ] **Step 5: Update acceptance documentation and commit**

Document the exact configuration-negative tests, persistence inspection, tamper test, KMS isolation test, and remaining limitation that this is not hardware-backed KMS/HSM.

```powershell
git add test/security/data-exposure.test.js test/security/encrypted-persistence.test.js test/unit/log-redaction.test.js "docs/测试与人工验收.md"
git commit -m "test: verify encrypted mysql persistence"
```

---

### Task 8: Final Verification and Delivery

**Files:**
- Review all files changed by Tasks 1–7.

- [ ] **Step 1: Verify no production JSON fallback remains**

Run: `rg -n "new JsonStore|new LogStore|DATA_FILE|LOG_FILE" src`

Expected: no production construction or environment fallback matches; legacy class definitions may remain only if explicitly marked test/legacy.

- [ ] **Step 2: Verify no private material crosses boundaries**

Run: `rg -n "privateJwk|KMS_MASTER_KEY|DB_PASSWORD" src public`

Expected: `privateJwk` appears only inside KMS/cryptographic local scope; master key and password appear only in configuration reads and are never logged.

- [ ] **Step 3: Run final suites from a clean process**

Run: `npm run test:node`

Run: `npm run test:ui`

Expected: both commands exit 0.

- [ ] **Step 4: Inspect repository changes**

Run: `git status --short` and `git diff --check HEAD~7..HEAD`

Expected: no unintended generated files, whitespace errors, or modifications to pre-existing unrelated user work.

- [ ] **Step 5: Record final limitations**

Delivery notes must state that MySQL installation/configuration remains for the user, `.env.example` contains no secrets, old JSON data is not migrated, and software KMS does not provide HSM-grade protection.
