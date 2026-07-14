const roles = Object.freeze({
  administrator: ['tenant_admin'],
  issuer: ['issuer_operator'],
  holder: ['holder_operator'],
  verifier: ['verifier_operator'],
  reader: ['tenant_admin', 'issuer_operator', 'holder_operator', 'verifier_operator'],
  sensitiveReader: ['credential_data_reader'],
});
import { localDemoWalletIdentity } from './demo-wallet-identity.js';

export class V2Api {
  constructor({ authenticator, accessService, didService, credentialService, disclosureService, verificationService,
    credentialAccessService, localSessionService = null, logService = null }) {
    this.authenticator = authenticator; this.accessService = accessService; this.didService = didService;
    this.credentialService = credentialService; this.disclosureService = disclosureService;
    this.verificationService = verificationService; this.localSessionService = localSessionService; this.logService = logService;
    this.credentialAccessService = credentialAccessService;
  }

  async handle(request, url, requestId, readJson) {
    if (request.method === 'POST' && url.pathname === '/api/v2/session/local') {
      if (!this.localSessionService) { const error = new Error('Local development login is disabled'); error.code = 'NOT_FOUND'; throw error; }
      return { status: 200, body: await this.localSessionService.issue(await readJson(request)) };
    }
    let context = null;
    try {
      context = this.authenticator.authenticate(request, requestId);
      const result = await this.handleAuthorized(context, request, url, readJson);
      await this.logService?.info({ type: 'audit', module: 'API', action: 'V2_HTTP_REQUEST', success: true,
        correlationId: requestId, tenantId: context.tenantId, actorId: context.actorId, message: 'V2 API request completed',
        context: { method: request.method, pathname: url.pathname, status: result.status } });
      return result;
    } catch (error) {
      await this.logService?.warn({ type: 'system', module: 'API', action: 'V2_HTTP_REQUEST', success: false,
        correlationId: requestId, tenantId: context?.tenantId || null, actorId: context?.actorId || null,
        errorCode: error.code || 'INVALID_REQUEST', message: 'V2 API request failed', context: { method: request.method, pathname: url.pathname } });
      throw error;
    }
  }

  async handleAuthorized(context, request, url, readJson) {
    const query = { search: url.searchParams.get('search') || '', page: url.searchParams.get('page'), pageSize: url.searchParams.get('pageSize') };
    if (request.method === 'GET' && url.pathname === '/api/v2/state') {
      await this.accessService.requireAnyRole(context, roles.reader);
      const [dids, credentials, evidence] = await Promise.all([
        this.didService.listDids(context, { page: 1, pageSize: 100 }), this.credentialService.listCredentials(context, { page: 1, pageSize: 100 }),
        this.disclosureService.listVerificationEvidence(context, { page: 1, pageSize: 100 }),
      ]);
      const logs = evidence.items.map((entry) => this.publicEvidence(entry));
      return { status: 200, body: { dids: dids.items, credentials: credentials.items,
        verificationLogs: logs.filter((entry) => entry.format === 'credential'),
        disclosureVerificationLogs: logs.filter((entry) => entry.format !== 'credential') } };
    }
    if (request.method === 'GET' && url.pathname === '/api/v2/dids') {
      await this.accessService.requireAnyRole(context, roles.reader);
      return { status: 200, body: await this.didService.listDids(context, { ...query, role: url.searchParams.get('role') || null, status: url.searchParams.get('status') || null }) };
    }
    if (request.method === 'POST' && url.pathname === '/api/v2/dids') {
      await this.accessService.requireAnyRole(context, roles.administrator);
      return { status: 201, body: await this.didService.createDid(context, await readJson(request)) };
    }
    if (request.method === 'POST' && url.pathname === '/api/v2/holder-dids/registration') {
      await this.accessService.requireAnyRole(context, roles.issuer);
      return { status: 201, body: await this.didService.registerExternalHolderDid(context, await readJson(request)) };
    }
    if (request.method === 'GET' && url.pathname === '/api/v2/credentials') {
      await this.accessService.requireAnyRole(context, roles.reader);
      return { status: 200, body: await this.credentialService.listCredentials(context, query) };
    }
    if (request.method === 'POST' && url.pathname === '/api/v2/credentials') {
      await this.accessService.requireAnyRole(context, roles.issuer);
      const body = await readJson(request);
      const normalized = { ...body };
      if (body.subjectName !== undefined || body.studentName !== undefined) normalized.subjectName = body.subjectName ?? body.studentName;
      if (body.course !== undefined || body.courseName !== undefined) normalized.course = body.course ?? body.courseName;
      return { status: 201, body: await this.credentialService.issueCredential(context, normalized) };
    }
    if (request.method === 'POST' && url.pathname === '/api/v2/verify') {
      await this.accessService.requireAnyRole(context, roles.verifier);
      return { status: 200, body: await this.verificationService.verifyCredential(context, (await readJson(request)).credential) };
    }
    if (request.method === 'POST' && url.pathname === '/api/v2/disclosures/verify') {
      await this.accessService.requireAnyRole(context, roles.verifier);
      return { status: 200, body: await this.verificationService.verifyTeachingDisclosure(context, (await readJson(request)).presentation) };
    }
    if (request.method === 'POST' && url.pathname === '/api/v2/sd-jwt/verify') {
      await this.accessService.requireAnyRole(context, roles.verifier);
      return { status: 200, body: await this.verificationService.verifySdJwt(context, (await readJson(request)).sdJwt) };
    }
    if (request.method === 'POST' && url.pathname === '/api/v2/wallet-challenges') {
      await this.accessService.requireAnyRole(context, roles.verifier);
      return { status: 201, body: await this.verificationService.issueWalletChallenge(context, await readJson(request)) };
    }
    if (request.method === 'POST' && url.pathname === '/api/v2/wallet-presentations/verify') {
      await this.accessService.requireAnyRole(context, roles.verifier);
      return { status: 200, body: await this.verificationService.verifyWalletPresentation(context, (await readJson(request)).presentation) };
    }
    if (request.method === 'GET' && url.pathname === '/api/v2/verification-logs') {
      await this.accessService.requireAnyRole(context, roles.reader);
      const result = await this.disclosureService.listVerificationEvidence(context, { ...query, verificationKind: 'credential' });
      return { status: 200, body: { ...result, items: result.items.map((entry) => this.publicEvidence(entry)) } };
    }
    if (request.method === 'GET' && url.pathname === '/api/v2/disclosure-verification-logs') {
      await this.accessService.requireAnyRole(context, roles.reader);
      const result = await this.disclosureService.listVerificationEvidence(context, { page: 1, pageSize: 100 });
      const filtered = result.items.map((entry) => this.publicEvidence(entry)).filter((entry) => entry.format !== 'credential');
      const pageSize = Math.max(1, Number(query.pageSize) || 10); const page = Math.max(1, Number(query.page) || 1);
      return { status: 200, body: { items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length,
        page, pageSize, totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)) } };
    }
    if (request.method === 'GET' && url.pathname === '/api/v2/logs') {
      await this.accessService.requireAnyRole(context, roles.administrator);
      return { status: 200, body: await this.logService.query(Object.fromEntries(url.searchParams)) };
    }
    if (request.method === 'GET' && url.pathname === '/api/v2/sensitive-access-logs') {
      await this.accessService.requireAnyRole(context, roles.administrator);
      return { status: 200, body: await this.credentialAccessService.listAccessLogs(context, {
        page: query.page, pageSize: query.pageSize, credentialId: url.searchParams.get('credentialId') || null,
        actorId: url.searchParams.get('actorId') || null, purposeCode: url.searchParams.get('purposeCode') || null,
      }) };
    }
    const logDetail = url.pathname.match(/^\/api\/v2\/logs\/([^/]+)$/);
    if (request.method === 'GET' && logDetail) {
      await this.accessService.requireAnyRole(context, roles.administrator);
      const entry = await this.logService.get(decodeURIComponent(logDetail[1]));
      if (!entry) { const error = new Error('Log entry was not found'); error.code = 'NOT_FOUND'; throw error; }
      return { status: 200, body: entry };
    }
    if (request.method === 'DELETE' && url.pathname === '/api/v2/logs') {
      await this.accessService.requireAnyRole(context, roles.administrator);
      return { status: 200, body: await this.logService.clear({ correlationId: context.requestId, confirm: (await readJson(request)).confirm }) };
    }
    if (request.method === 'POST' && url.pathname === '/api/v2/demo/reset') {
      if (!this.localSessionService?.enabled) { const error = new Error('Demo reset is unavailable outside local development'); error.code = 'NOT_FOUND'; throw error; }
      await this.accessService.requireAnyRole(context, roles.administrator);
      const suffix = new Date().toISOString();
      const issuer = await this.didService.createDid(context, { name: `演示签发方 ${suffix}`, role: 'issuer', method: 'example' });
      const holder = await this.didService.registerExternalHolderDid(context, { name: `演示钱包持有者 ${suffix}`,
        did: localDemoWalletIdentity.did, document: localDemoWalletIdentity.document });
      const credential = await this.credentialService.issueCredential(context, { issuerDid: issuer.did, holderDid: holder.did,
        subjectName: '演示学员', course: 'DID 与 VC 生产链路', completionDate: new Date().toISOString().slice(0, 10),
        validUntil: new Date(Date.now() + 365 * 86_400_000).toISOString() });
      return { status: 200, body: { issuer, holder, credential } };
    }
    const contentAccess = url.pathname.match(/^\/api\/v2\/credentials\/([^/]+)\/content-access$/);
    if (request.method === 'POST' && contentAccess) {
      await this.accessService.requireAnyRole(context, roles.sensitiveReader);
      const body = await readJson(request);
      return { status: 200, body: await this.credentialAccessService.readPlaintext(
        context, decodeURIComponent(contentAccess[1]), body.purpose,
      ) };
    }
    const walletPackage = url.pathname.match(/^\/api\/v2\/credentials\/([^/]+)\/wallet-package$/);
    if (request.method === 'POST' && walletPackage) {
      await this.accessService.requireAnyRole(context, roles.issuer);
      return { status: 200, body: await this.credentialService.createWalletPackage(context, decodeURIComponent(walletPackage[1])) };
    }
    const disclose = url.pathname.match(/^\/api\/v2\/credentials\/([^/]+)\/(disclosures|sd-jwt)$/);
    if (request.method === 'POST' && disclose) {
      await this.accessService.requireAnyRole(context, roles.holder);
      const body = await readJson(request); const id = decodeURIComponent(disclose[1]);
      const presentation = disclose[2] === 'sd-jwt'
        ? await this.disclosureService.createSdJwtPresentation(context, id, body.paths)
        : await this.disclosureService.createTeachingPresentation(context, id, body.paths);
      return { status: 200, body: disclose[2] === 'sd-jwt' ? { sdJwt: presentation } : presentation };
    }
    if (request.method === 'GET' && url.pathname === '/api/v2/verification-evidence') {
      await this.accessService.requireAnyRole(context, [...roles.verifier, 'tenant_admin']);
      return { status: 200, body: await this.disclosureService.listVerificationEvidence(context, query) };
    }
    if (request.method === 'POST' && url.pathname === '/api/v2/verification-evidence') {
      await this.accessService.requireAnyRole(context, roles.verifier);
      return { status: 201, body: await this.disclosureService.recordVerification(context, await readJson(request)) };
    }
    const lifecycle = url.pathname.match(/^\/api\/v2\/credentials\/([^/]+)\/(suspend|resume|revoke|replace)$/);
    if (request.method === 'POST' && lifecycle) {
      await this.accessService.requireAnyRole(context, roles.issuer);
      const body = await readJson(request); const methods = { suspend: 'suspendCredential', resume: 'resumeCredential', revoke: 'revokeCredential', replace: 'replaceCredential' };
      return { status: 200, body: await this.credentialService[methods[lifecycle[2]]](context, decodeURIComponent(lifecycle[1]), body) };
    }
    const didLifecycle = url.pathname.match(/^\/api\/v2\/dids\/([^/]+)(?:\/(rotate-key|deactivate))?$/);
    if (didLifecycle) {
      await this.accessService.requireAnyRole(context, roles.administrator);
      const body = await readJson(request); const id = decodeURIComponent(didLifecycle[1]);
      if (request.method === 'PATCH' && !didLifecycle[2]) return { status: 200, body: await this.didService.updateDid(context, id, body) };
      if (request.method === 'POST' && didLifecycle[2] === 'rotate-key') return { status: 200, body: await this.didService.rotateDidKey(context, id, body) };
      if (request.method === 'POST' && didLifecycle[2] === 'deactivate') return { status: 200, body: await this.didService.deactivateDid(context, id, body) };
    }
    const error = new Error('V2 route was not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  publicEvidence(entry) {
    const evidence = entry.evidence || {};
    return { id: entry.id, credentialId: entry.credentialId, valid: entry.outcome === 'valid', checkedAt: entry.occurredAt,
      format: entry.verificationKind, checks: evidence.checks || [], disclosedPaths: evidence.disclosedPaths || [],
      failedChecks: evidence.failedChecks || [] };
  }
}
