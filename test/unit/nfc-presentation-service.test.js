import assert from 'node:assert/strict';
import test from 'node:test';
import { NfcPresentationService } from '../../src/services/nfc-presentation-service.js';

test('simulated NFC hides challenge while preserving one-time verification flow', async () => {
  let record = null; const calls = [];
  const repository = {
    async create(_pool, value) { record = { ...value, status: 'issued', presentation: null, submittedAt: null }; },
    async find() { return record; },
    async submit(_pool, id, presentation, submittedAt) { record = { ...record, id, status: 'pending', presentation, submittedAt }; return record; },
    async latestPending() { return record?.status === 'pending' ? record : null; },
    async complete(_pool, _id, _context, result) { record.status = result.valid ? 'verified' : 'invalid'; },
  };
  const verificationService = {
    async importWalletChallenge(_context, input) { calls.push(['challenge', input]); },
    async verifyMultiWalletPresentation(_context, presentation) { calls.push(['verify', presentation]); return { valid: true, presentationId: 'result-1' }; },
  };
  const service = new NfcPresentationService({ pool: {}, repository,
    holderDidDirectoryRepository: { async findByDid() { return { status: 'active' }; } }, verificationService,
    clock: () => Date.parse('2026-07-15T00:00:00.000Z') });
  const issued = await service.issueChallenge({ holderDid: 'did:key:zholder' });
  const presentation = { holderDid: 'did:key:zholder', challenge: issued.challenge, domain: issued.domain,
    verifiableCredentials: [{ format: 'vc+sd-jwt', sdJwt: 'value' }] };
  await service.submit(issued.transferId, { presentation });
  assert.deepEqual(await service.latest(), { transferId: issued.transferId, holderDid: 'did:key:zholder',
    submittedAt: '2026-07-15T00:00:00.000Z', expiresAt: issued.expiresAt, credentialCount: 1 });
  const qr = await service.qrCode(issued.transferId);
  assert.match(qr.payload, /^didvc:\/\/present\?transfer=/);
  assert.match(qr.dataUrl, /^data:image\/png;base64,/);
  const result = await service.verify({ tenantId: 'verifier-org', actorId: 'verifier' }, issued.transferId);
  assert.equal(result.valid, true);
  assert.equal(calls[0][1].challenge, issued.challenge);
  assert.equal(calls[1][1], presentation);
  await assert.rejects(() => service.verify({ tenantId: 'verifier-org' }, issued.transferId), /没有可验证/);
});
