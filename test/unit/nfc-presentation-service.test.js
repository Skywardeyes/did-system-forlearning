import assert from 'node:assert/strict';
import test from 'node:test';
import { NfcPresentationService } from '../../src/services/nfc-presentation-service.js';

test('simulated NFC hides challenge while preserving one-time verification flow', async () => {
  let record = null; const calls = [];
  const repository = {
    async create(_pool, value) { record = { ...value, status: 'issued', presentation: null, submittedAt: null }; },
    async find() { return record; },
    async submit(_pool, id, presentation, submittedAt) { record = { ...record, id, status: 'pending', presentation, submittedAt }; return record; },
    async latestPending(_pool, organizationId) { return record?.status === 'pending' && record.targetOrganizationId === organizationId ? record : null; },
    async complete(_pool, _id, _context, result) { record.status = result.valid ? 'verified' : 'invalid'; },
  };
  const verificationService = {
    async importWalletChallenge(_context, input) { calls.push(['challenge', input]); },
    async verifyMultiWalletPresentation(_context, presentation) { calls.push(['verify', presentation]); return { valid: true, presentationId: 'result-1' }; },
  };
  const service = new NfcPresentationService({ pool: {}, repository,
    holderDidDirectoryRepository: { async findByDid() { return { status: 'active' }; } }, verificationService,
    organizationRepository: { async findById(_operation, id) { return id === 'verifier-org'
      ? { id, name: '验证机构', workspaceType: 'organization', status: 'active', verificationStatus: 'approved' } : null; } },
    clock: () => Date.parse('2026-07-15T00:00:00.000Z') });
  const issued = await service.issueChallenge({ holderDid: 'did:key:zholder', organizationId: 'verifier-org' });
  assert.equal(issued.targetOrganizationId, 'verifier-org');
  const presentation = { holderDid: 'did:key:zholder', challenge: issued.challenge, domain: issued.domain,
    verifiableCredentials: [{ format: 'vc+sd-jwt', sdJwt: 'value' }] };
  await service.submit(issued.transferId, { presentation });
  assert.equal(await service.latest({ tenantId: 'other-org' }), null);
  assert.deepEqual(await service.latest({ tenantId: 'verifier-org' }), { transferId: issued.transferId, holderDid: 'did:key:zholder',
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

test('simulated presentation cannot be verified by a different organization', async () => {
  const record = { id: 'transfer-1', holderDid: 'did:key:zholder', targetOrganizationId: 'target-org', status: 'pending',
    presentation: { holderDid: 'did:key:zholder' }, challenge: 'challenge', domain: 'domain', expiresAt: '2026-07-15T00:05:00.000Z' };
  const service = new NfcPresentationService({ pool: {}, repository: { async find() { return record; } },
    holderDidDirectoryRepository: {}, organizationRepository: {}, verificationService: {},
    clock: () => Date.parse('2026-07-15T00:00:00.000Z') });
  await assert.rejects(() => service.verify({ tenantId: 'other-org' }, record.id), { code: 'NFC_PRESENTATION_WRONG_ORGANIZATION' });
});
