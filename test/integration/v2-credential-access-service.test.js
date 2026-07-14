import assert from 'node:assert/strict';
import test from 'node:test';
import { V2CredentialAccessService } from '../../src/services/v2-credential-access-service.js';

const context = { tenantId: 'tenant-1', actorId: 'actor-1', requestId: 'request-1' };
const operation = { context, connection: {} };
const unitOfWork = { run: async (current, callback) => callback({ ...operation, context: current }) };

test('sensitive VC read requires a controlled purpose and writes audit before returning plaintext', async () => {
  const events = [];
  const service = new V2CredentialAccessService({ unitOfWork,
    credentialRepository: { async findById(_operation, id) { events.push(`read:${id}`); return { credential: { id, secretClaim: 'protected' } }; } },
    sensitiveAccessLogRepository: { async append(_operation, entry) { events.push(`audit:${entry.purposeCode}`); } },
  });
  const result = await service.readPlaintext(context, 'vc-1', 'holder_review');
  assert.deepEqual(events, ['read:vc-1', 'audit:holder_review']);
  assert.equal(result.credential.secretClaim, 'protected');
  await assert.rejects(() => service.readPlaintext(context, 'vc-1', 'anything'), { code: 'INVALID_ACCESS_PURPOSE' });
});

test('sensitive VC read fails closed when the audit ledger cannot be written', async () => {
  const service = new V2CredentialAccessService({ unitOfWork,
    credentialRepository: { async findById() { return { credential: { secretClaim: 'must-not-return' } }; } },
    sensitiveAccessLogRepository: { async append() { throw new Error('audit unavailable'); } },
  });
  await assert.rejects(() => service.readPlaintext(context, 'vc-1', 'legal_audit'), /audit unavailable/);
});
