import assert from 'node:assert/strict';
import test from 'node:test';
import { V2Api } from '../../src/v2-api.js';
import { AuthenticationError, AuthorizationError } from '../../src/auth/request-authenticator.js';

const context = { tenantId: 'tenant-1', actorId: 'user-1', requestId: 'request-1' };
const request = (method, authorization = 'Bearer test') => ({ method, headers: { authorization } });

class Authenticator { authenticate(_request, requestId) { if (!_request.headers.authorization) throw new AuthenticationError(); return { ...context, requestId }; } }
class Access { constructor({ allowed = true } = {}) { this.allowed = allowed; this.calls = []; } async requireAnyRole(current, roles) { this.calls.push({ current, roles }); if (!this.allowed) throw new AuthorizationError(); return current; } }

test('V2 API authenticates and authorizes tenant-scoped credential issuance', async () => {
  const accessService = new Access(); const issued = [];
  const api = new V2Api({ authenticator: new Authenticator(), accessService,
    didService: {}, disclosureService: {}, credentialService: { async issueCredential(current, body) { issued.push({ current, body }); return { id: 'vc-1' }; } } });
  const result = await api.handle(request('POST'), new URL('http://local/api/v2/credentials'), 'request-1', async () => ({ course: 'DID' }));
  assert.equal(result.status, 201); assert.equal(result.body.id, 'vc-1');
  assert.deepEqual(issued[0], { current: context, body: { course: 'DID' } });
  assert.deepEqual(accessService.calls[0].roles, ['issuer_operator']);
});

test('V2 API rejects unauthenticated and unauthorized requests before service invocation', async () => {
  const api = new V2Api({ authenticator: { authenticate() { throw new AuthenticationError(); } }, accessService: new Access(), didService: {}, credentialService: {}, disclosureService: {} });
  await assert.rejects(() => api.handle(request('GET', ''), new URL('http://local/api/v2/dids'), 'request-1', async () => ({})), AuthenticationError);
  const denied = new V2Api({ authenticator: new Authenticator(), accessService: new Access({ allowed: false }), didService: { listDids: async () => { throw new Error('must not run'); } }, credentialService: {}, disclosureService: {} });
  await assert.rejects(() => denied.handle(request('GET'), new URL('http://local/api/v2/dids'), 'request-1', async () => ({})), AuthorizationError);
});

test('V2 API requires a separate sensitive-reader role and purpose for plaintext access', async () => {
  const accessService = new Access(); const reads = [];
  const api = new V2Api({ authenticator: new Authenticator(), accessService, didService: {}, credentialService: {}, disclosureService: {},
    credentialAccessService: { async readPlaintext(current, id, purpose) { reads.push({ current, id, purpose }); return { credential: { id } }; } } });
  const result = await api.handle(request('POST'), new URL('http://local/api/v2/credentials/vc-1/content-access'), 'request-1', async () => ({ purpose: 'legal_audit' }));
  assert.equal(result.status, 200);
  assert.deepEqual(accessService.calls[0].roles, ['credential_data_reader']);
  assert.deepEqual(reads[0], { current: context, id: 'vc-1', purpose: 'legal_audit' });
});

test('tenant admin can review sensitive access metadata without receiving VC content', async () => {
  const accessService = new Access();
  const api = new V2Api({ authenticator: new Authenticator(), accessService, didService: {}, credentialService: {}, disclosureService: {},
    credentialAccessService: { async listAccessLogs() { return { items: [{ credentialId: 'vc-1', purposeCode: 'legal_audit' }], total: 1 }; } } });
  const result = await api.handle(request('GET'), new URL('http://local/api/v2/sensitive-access-logs'), 'request-1', async () => ({}));
  assert.deepEqual(accessService.calls[0].roles, ['tenant_admin']);
  assert.equal(result.body.items[0].credential, undefined);
});
