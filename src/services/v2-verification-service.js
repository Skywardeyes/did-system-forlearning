import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createClaimDigest, verifyCompactJwt, verifyCredentialSignature, verifyPayload } from '../crypto.js';

const LEGACY_SD_PATHS = { name: 'credentialSubject.name', course: 'credentialSubject.course', completion_date: 'credentialSubject.completionDate' };
const SAFE_CLAIM_NAME = /^[a-z][A-Za-z0-9_]{0,63}$/;
const check = (key, label, passed, detail) => ({ key, label, passed: Boolean(passed), detail });
const challengeHash = (value) => createHash('sha256').update(value).digest('hex');

function effectiveStatus(record) {
  if (!record) return 'missing';
  if (Date.parse(record.validUntil) < Date.now() && !['replaced', 'revoked'].includes(record.status)) return 'expired';
  return record.status;
}

export class V2VerificationService {
  constructor({ unitOfWork, didRepository, didKeyVersionRepository, credentialRepository, verificationLogRepository,
    verifierChallengeRepository = null, publicTrustRepository = null, presentationRepository = null }) {
    this.unitOfWork = unitOfWork; this.didRepository = didRepository; this.didKeyVersionRepository = didKeyVersionRepository;
    this.credentialRepository = credentialRepository; this.verificationLogRepository = verificationLogRepository;
    this.verifierChallengeRepository = verifierChallengeRepository;
    this.publicTrustRepository = publicTrustRepository; this.presentationRepository = presentationRepository;
  }

  async issueWalletChallenge(context, input = {}) {
    const domain = typeof input.domain === 'string' ? input.domain.trim().toLowerCase() : '';
    const requestedTtl = Number(input.ttlSeconds ?? 300);
    if (!domain || domain.length > 255 || /\s/.test(domain)) throw new Error('Verifier domain is required and must not contain whitespace');
    if (!Number.isInteger(requestedTtl) || requestedTtl < 60 || requestedTtl > 600) throw new Error('Challenge TTL must be an integer between 60 and 600 seconds');
    if (!this.verifierChallengeRepository) throw new Error('Verifier challenge ledger is not configured');
    const challenge = randomBytes(32).toString('base64url');
    const createdAt = new Date(); const expiresAt = new Date(createdAt.getTime() + requestedTtl * 1000);
    await this.unitOfWork.run(context, (operation) => this.verifierChallengeRepository.issue(operation, {
      id: randomUUID(), challengeHash: challengeHash(challenge), domain, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString(),
    }));
    return { challenge, domain, expiresAt: expiresAt.toISOString(), ttlSeconds: requestedTtl };
  }

  async importWalletChallenge(context, input = {}) {
    const challenge = String(input.challenge || ''); const domain = String(input.domain || '').trim().toLowerCase();
    const expiresAt = new Date(input.expiresAt); const createdAt = new Date();
    if (challenge.length < 16 || !domain || !Number.isFinite(expiresAt.getTime()) || expiresAt <= createdAt) throw new Error('Transferred verifier challenge is invalid or expired');
    await this.unitOfWork.run(context, (operation) => this.verifierChallengeRepository.issue(operation, {
      id: randomUUID(), challengeHash: challengeHash(challenge), domain, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString(),
    }));
  }

  async listPresentations(context, query = {}) {
    if (!this.presentationRepository) throw new Error('Verification presentation ledger is not configured');
    return this.unitOfWork.run(context, (operation) => this.presentationRepository.list(operation, query));
  }

  async resolveIssuerKey(operation, issuerDid, proof) {
    const issuer = this.publicTrustRepository
      ? await this.publicTrustRepository.resolveDid(operation, issuerDid)
      : await this.didRepository.findByDid(operation, issuerDid);
    const key = issuer && proof && (this.publicTrustRepository
      ? await this.publicTrustRepository.resolveKey(operation, issuerDid, Number(proof.keyVersion || 1))
      : await this.didKeyVersionRepository.findByDidVersion(operation, issuer.id, Number(proof.keyVersion || 1)));
    const matches = Boolean(key) && key.verificationMethod === proof?.verificationMethod;
    return { issuer, key: matches ? key : null };
  }

  async credentialStatus(operation, id) {
    return this.publicTrustRepository ? this.publicTrustRepository.findCredentialStatus(operation, id) : this.credentialRepository.findById(operation, id);
  }

  async verifyCredential(context, credential) {
    return this.unitOfWork.run(context, async (operation) => {
      const format = Boolean(credential?.id && credential?.issuer && credential?.credentialSubject?.id && credential?.proof?.proofValue);
      const { issuer, key } = await this.resolveIssuerKey(operation, credential?.issuer, credential?.proof);
      const record = credential?.id ? await this.credentialStatus(operation, credential.id) : null;
      let signature = false;
      try { signature = Boolean(key) && verifyCredentialSignature(credential, key.publicJwk); } catch { signature = false; }
      const now = Date.now();
      const validity = Number.isFinite(Date.parse(credential?.validFrom)) && Number.isFinite(Date.parse(credential?.validUntil))
        && Date.parse(credential.validFrom) <= now && now <= Date.parse(credential.validUntil);
      const status = effectiveStatus(record);
      const checks = [
        check('format', '凭证格式', format, format ? '必要字段完整' : '缺少必要字段'),
        check('issuer', 'Issuer DID 解析', issuer, issuer ? '已解析签发方' : '签发方不存在'),
        check('didStatus', 'Issuer DID 状态', issuer?.status === 'active', issuer?.status === 'active' ? '签发方当前有效' : '签发方已停用或不存在'),
        check('keyVersion', '签名密钥解析', key, key ? `已解析密钥版本 ${key.version}` : '密钥版本或验证方法不可用'),
        check('signature', 'Ed25519 签名', signature, signature ? '签名有效，内容未被修改' : '签名无效或内容已被修改'),
        check('validity', '凭证有效期', validity, validity ? `有效至 ${credential?.validUntil}` : '尚未生效、已经过期或时间无效'),
        check('credentialStatus', '凭证当前状态', status === 'active', status === 'active' ? '凭证当前有效' : `凭证状态为 ${status}`),
      ];
      return this.finish(operation, 'credential', credential?.id || null, checks, []);
    });
  }

  async verifyTeachingDisclosure(context, presentation) {
    return this.unitOfWork.run(context, async (operation) => {
      const disclosures = Array.isArray(presentation?.disclosedClaims) ? presentation.disclosedClaims : [];
      const format = Boolean(presentation?.type === 'EducationalSelectiveDisclosurePresentation2026' && presentation?.credentialId
        && presentation?.issuer && disclosures.length && presentation?.claimDigests && presentation?.proof?.proofValue);
      const { issuer, key } = await this.resolveIssuerKey(operation, presentation?.issuer, presentation?.proof);
      const manifest = { type: 'EducationalSelectiveDisclosureManifest2026', credentialId: presentation?.credentialId,
        issuer: presentation?.issuer, validFrom: presentation?.validFrom, validUntil: presentation?.validUntil, claimDigests: presentation?.claimDigests };
      let signature = false;
      try { signature = Boolean(key) && verifyPayload(manifest, key.publicJwk, presentation?.proof?.proofValue); } catch { signature = false; }
      const paths = disclosures.map((item) => item?.path); const unique = new Set(paths);
      const digests = disclosures.length > 0 && unique.size === disclosures.length && disclosures.every((item) => {
        const expected = presentation?.claimDigests?.[item.path];
        return /^credentialSubject\.[a-z][A-Za-z0-9_]{0,63}$/.test(item.path) && typeof expected === 'string'
          && createClaimDigest(item.path, item.salt, item.value) === expected;
      });
      const record = presentation?.credentialId ? await this.credentialStatus(operation, presentation.credentialId) : null;
      const now = Date.now(); const validity = Number.isFinite(Date.parse(presentation?.validFrom)) && Number.isFinite(Date.parse(presentation?.validUntil))
        && Date.parse(presentation.validFrom) <= now && now <= Date.parse(presentation.validUntil);
      const status = effectiveStatus(record);
      const checks = [check('format', '披露证明格式', format, format ? '必要字段完整' : '结构不完整'),
        check('issuer', 'Issuer DID 解析', issuer, issuer ? '已解析签发方' : '签发方不存在'),
        check('didStatus', 'Issuer DID 状态', issuer?.status === 'active', issuer?.status === 'active' ? '签发方有效' : '签发方停用或不存在'),
        check('keyVersion', '签名密钥解析', key, key ? '已解析当前或历史公钥' : '密钥不可用'),
        check('manifestSignature', '摘要清单签名', signature, signature ? 'Issuer 签名有效' : '摘要清单签名无效'),
        check('disclosedClaims', '已披露字段摘要', digests, digests ? `${disclosures.length} 个字段摘要一致` : '字段被修改、重复或不受支持'),
        check('validity', '凭证有效期', validity, validity ? `有效至 ${presentation?.validUntil}` : '有效期无效'),
        check('credentialStatus', '凭证当前状态', status === 'active', status === 'active' ? '凭证当前有效' : `凭证状态为 ${status}`)];
      return this.finish(operation, 'teaching-disclosure', presentation?.credentialId || null, checks, paths.filter(Boolean));
    });
  }

  async verifySdJwt(context, compactPresentation) {
    return this.unitOfWork.run(context, async (operation) => {
      const parts = String(compactPresentation || '').split('~'); const issuerJwt = parts.shift(); const trailing = parts.pop(); const disclosures = parts;
      const format = Boolean(issuerJwt && issuerJwt.split('.').length === 3 && trailing === '' && disclosures.length && disclosures.length <= 50);
      let header = null; let payload = null;
      try { header = JSON.parse(Buffer.from(issuerJwt.split('.')[0], 'base64url').toString('utf8')); payload = JSON.parse(Buffer.from(issuerJwt.split('.')[1], 'base64url').toString('utf8')); } catch { /* checks report failure */ }
      const { issuer, key } = await this.resolveIssuerKey(operation, payload?.iss, { keyVersion: header?.keyVersion, verificationMethod: header?.kid });
      let signature = false;
      try { const verified = key && verifyCompactJwt(issuerJwt, key.publicJwk); signature = Boolean(verified?.valid && verified.header?.alg === 'EdDSA' && verified.header?.typ === 'vc+sd-jwt'); payload = verified?.payload || payload; } catch { signature = false; }
      let disclosurePassed = format && new Set(disclosures).size === disclosures.length && payload?._sd_alg === 'sha-256' && Array.isArray(payload?._sd);
      const paths = []; const claimNames = new Set();
      if (disclosurePassed) for (const disclosure of disclosures) {
        try {
          const [salt, name, value] = JSON.parse(Buffer.from(disclosure, 'base64url').toString('utf8'));
          const path = LEGACY_SD_PATHS[name] || (SAFE_CLAIM_NAME.test(String(name)) ? `credentialSubject.${name}` : null);
          const digest = createHash('sha256').update(disclosure).digest('base64url');
          if (!salt || !path || value === undefined || claimNames.has(name) || !payload._sd.includes(digest)) { disclosurePassed = false; break; }
          claimNames.add(name); paths.push(path);
        } catch { disclosurePassed = false; break; }
      }
      let schemaPassed = true; let schemaDetail = 'Legacy credential without a versioned template';
      if (payload?.schema_id || payload?.schema_version || payload?.schema_hash) {
        const schema = this.publicTrustRepository && payload?.schema_id && Number.isInteger(Number(payload?.schema_version)) && payload?.schema_hash
          ? await this.publicTrustRepository.resolveCredentialTemplate(operation, payload.schema_id, Number(payload.schema_version), payload.schema_hash)
          : null;
        const declaredFields = new Set((schema?.schema?.fields || []).map((field) => field.key));
        schemaPassed = Boolean(schema && schema.credentialType === payload?.vct && [...claimNames].every((name) => declaredFields.has(name)));
        schemaDetail = schemaPassed ? `Template ${schema.id} v${schema.version} and disclosed fields match` : 'Template version, digest, credential type, or disclosed field is not trusted';
      }
      const now = Math.floor(Date.now() / 1000); const validity = Number.isFinite(payload?.nbf) && Number.isFinite(payload?.exp) && payload.nbf <= now && now <= payload.exp;
      const record = payload?.jti ? await this.credentialStatus(operation, payload.jti) : null; const status = effectiveStatus(record);
      const checks = [check('format', 'SD-JWT 格式', format, format ? '紧凑序列化结构完整' : '格式无效'),
        check('issuer', 'Issuer DID 解析', issuer, issuer ? '已解析签发方' : '签发方不存在'),
        check('didStatus', 'Issuer DID 状态', issuer?.status === 'active', issuer?.status === 'active' ? '签发方有效' : '签发方停用或不存在'),
        check('keyVersion', '签名密钥解析', key, key ? '已解析公钥' : '密钥不可用'),
        check('signature', 'Issuer JWT 签名', signature, signature ? 'EdDSA JWS 签名有效' : 'JWT 签名、alg 或 typ 无效'),
        check('disclosedClaims', 'SD-JWT 披露摘要', disclosurePassed, disclosurePassed ? `${paths.length} 个披露项摘要一致` : '披露项无效或摘要不匹配'),
        check('validity', '凭证有效期', validity, validity && payload?.exp ? `有效至 ${new Date(payload.exp * 1000).toISOString()}` : '有效期无效'),
        check('credentialStatus', '凭证当前状态', status === 'active', status === 'active' ? '凭证当前有效' : `凭证状态为 ${status}`)];
      checks.splice(4, 0, check('credentialSchema', 'Credential schema', schemaPassed, schemaDetail));
      return this.finish(operation, 'sd-jwt', payload?.jti || null, checks, paths, { format: 'sd-jwt' });
    });
  }

  async verifyWalletPresentation(context, presentation) {
    const sdJwtResult = await this.verifySdJwt(context, presentation?.sdJwt);
    return this.unitOfWork.run(context, async (operation) => {
      let payload = null;
      try { payload = JSON.parse(Buffer.from(String(presentation?.sdJwt || '').split('~')[0].split('.')[1], 'base64url').toString('utf8')); } catch { /* reported below */ }
      const holder = presentation?.holderDid && (this.publicTrustRepository
        ? await this.publicTrustRepository.resolveDid(operation, presentation.holderDid)
        : await this.didRepository.findByDid(operation, presentation.holderDid));
      const holderProof = presentation?.holderProof;
      const verificationMethod = holder?.document?.verificationMethod?.find((item) => item.id === holderProof?.verificationMethod);
      const binding = {
        type: 'WalletBoundSdJwtPresentation2026', sdJwt: presentation?.sdJwt, holderDid: presentation?.holderDid,
        verificationMethod: holderProof?.verificationMethod, challenge: holderProof?.challenge, domain: holderProof?.domain,
      };
      let holderSignature = false;
      try { holderSignature = Boolean(verificationMethod?.publicKeyJwk) && verifyPayload(binding, verificationMethod.publicKeyJwk, holderProof?.proofValue); } catch { holderSignature = false; }
      const holderRegistered = Boolean(holder?.role === 'holder' && holder?.status === 'active'
        && (this.publicTrustRepository || holder?.metadata?.keyCustody === 'holder_self_custody'));
      const holderMatchesSubject = Boolean(payload?.sub && payload.sub === presentation?.holderDid);
      const challengeBinding = typeof holderProof?.challenge === 'string' && holderProof.challenge.length >= 16
        && holderProof.challenge === presentation?.challenge && holderProof.domain === presentation?.domain;
      const baseValid = sdJwtResult.valid && holderRegistered && holderMatchesSubject && holderSignature && challengeBinding;
      const challengeConsumed = baseValid && this.verifierChallengeRepository
        ? await this.verifierChallengeRepository.consume(operation, {
          challengeHash: challengeHash(holderProof.challenge), domain: holderProof.domain, credentialId: payload?.jti || null, consumedAt: new Date().toISOString(),
        }) : false;
      const challenge = challengeBinding && challengeConsumed;
      const checks = [
        ...sdJwtResult.checks,
        check('holderDid', 'Holder DID 登记', holderRegistered, holderRegistered ? '已解析个人钱包自托管 DID' : 'Holder DID 未登记或不是自托管身份'),
        check('holderSubject', 'Holder 与凭证主体绑定', holderMatchesSubject, holderMatchesSubject ? 'SD-JWT sub 与 Holder DID 一致' : 'Holder DID 与凭证主体不一致'),
        check('holderProof', 'Holder 本地签名绑定', holderSignature, holderSignature ? '由 Holder DID 私钥完成本次出示签名' : 'Holder 签名无效或验证方法不匹配'),
        check('challenge', '验证方 Challenge 绑定', challenge, challenge ? 'Challenge 与验证方域名一致' : 'Challenge 或验证方域名无效'),
      ];
      return this.finish(operation, 'wallet-sd-jwt', payload?.jti || null, checks, sdJwtResult.disclosedPaths || [], { format: 'wallet-sd-jwt' });
    });
  }

  async verifyMultiWalletPresentation(context, presentation) {
    const entries = Array.isArray(presentation?.verifiableCredentials) ? presentation.verifiableCredentials : [];
    const disclosureCount = entries.reduce((count, entry) => count + Math.max(0, String(entry?.sdJwt || '').split('~').length - 2), 0);
    const format = presentation?.type === 'WalletBoundMultiSdJwtPresentation2026' && entries.length > 0 && entries.length <= 10
      && disclosureCount > 0 && disclosureCount <= 50
      && entries.every((entry) => entry?.format === 'vc+sd-jwt' && typeof entry.sdJwt === 'string');
    const parsed = entries.map((entry) => {
      try { return JSON.parse(Buffer.from(entry.sdJwt.split('~')[0].split('.')[1], 'base64url').toString('utf8')); } catch { return null; }
    });
    const identifiers = parsed.map((payload) => payload?.jti).filter(Boolean);
    const uniqueCredentials = identifiers.length === entries.length && new Set(identifiers).size === entries.length;
    const credentialResults = [];
    for (const entry of entries) credentialResults.push(await this.verifySdJwt(context, entry.sdJwt));

    return this.unitOfWork.run(context, async (operation) => {
      const presentationId = randomUUID(); const occurredAt = new Date().toISOString();
      const holder = presentation?.holderDid && (this.publicTrustRepository
        ? await this.publicTrustRepository.resolveDid(operation, presentation.holderDid)
        : await this.didRepository.findByDid(operation, presentation.holderDid));
      const holderProof = presentation?.holderProof;
      const verificationMethod = holder?.document?.verificationMethod?.find((item) => item.id === holderProof?.verificationMethod);
      const binding = { type: presentation?.type, holderDid: presentation?.holderDid, verifiableCredentials: entries,
        challenge: presentation?.challenge, domain: presentation?.domain, createdAt: presentation?.createdAt,
        verificationMethod: presentation?.verificationMethod };
      let holderSignature = false;
      try { holderSignature = Boolean(verificationMethod?.publicKeyJwk) && verifyPayload(binding, verificationMethod.publicKeyJwk, holderProof?.proofValue); } catch { holderSignature = false; }
      const holderRegistered = Boolean(holder?.role === 'holder' && holder?.status === 'active'
        && (this.publicTrustRepository || holder?.metadata?.keyCustody === 'holder_self_custody'));
      const subjectsMatch = parsed.length > 0 && parsed.every((payload) => payload?.sub === presentation?.holderDid);
      const allCredentials = uniqueCredentials && credentialResults.length === entries.length && credentialResults.every((result) => result.valid);
      const challengeBinding = typeof holderProof?.challenge === 'string' && holderProof.challenge.length >= 16
        && holderProof.challenge === presentation?.challenge && holderProof.domain === presentation?.domain;
      const baseValid = format && holderRegistered && subjectsMatch && holderSignature && allCredentials && challengeBinding;
      if (this.presentationRepository) await this.presentationRepository.begin(operation, { id: presentationId,
        holderDid: presentation?.holderDid || null, presentationType: presentation?.type || 'unknown', credentialCount: entries.length,
        occurredAt, evidence: { credentialIds: identifiers, disclosedPaths: credentialResults.map((result) => result.disclosedPaths || []) } });
      const challengeConsumed = baseValid && this.verifierChallengeRepository
        ? await this.verifierChallengeRepository.consume(operation, { challengeHash: challengeHash(holderProof.challenge),
          domain: holderProof.domain, presentationId: this.presentationRepository ? presentationId : null, consumedAt: occurredAt }) : false;
      const challenge = challengeBinding && challengeConsumed;
      const checks = [
        check('format', '多凭证组合出示格式', format && uniqueCredentials, format && uniqueCredentials ? `${entries.length} 张凭证结构完整且未重复` : '结构无效、数量超限或凭证重复'),
        check('holderDid', 'Holder DID 登记', holderRegistered, holderRegistered ? '已解析自托管 Holder DID' : 'Holder DID 未登记或已停用'),
        check('holderSubjects', '所有凭证主体一致', subjectsMatch, subjectsMatch ? '所有 SD-JWT sub 均属于当前 Holder' : '存在不属于当前 Holder 的凭证'),
        check('holderProof', 'Holder 组合签名', holderSignature, holderSignature ? '完整凭证组合由 Holder 本地私钥签名' : 'Holder 组合签名无效'),
        check('credentials', '逐张凭证验证', allCredentials, allCredentials ? `${entries.length} 张凭证全部通过` : '至少一张凭证无效'),
        check('challenge', '验证方 Challenge 绑定', challenge, challenge ? 'Challenge 已对整个组合原子消费' : 'Challenge 无效、过期或已使用'),
      ];
      const valid = checks.every((item) => item.passed);
      const items = credentialResults.map((result, index) => ({ credentialId: result.credentialId,
        issuerDid: parsed[index]?.iss || null, credentialType: parsed[index]?.vct || null, outcome: result.valid ? 'valid' : 'invalid',
        disclosedPaths: result.disclosedPaths || [], failedChecks: result.checks.filter((item) => !item.passed).map((item) => item.key) }));
      if (this.presentationRepository) await this.presentationRepository.complete(operation, presentationId, valid ? 'valid' : 'invalid', items);
      await this.verificationLogRepository.append(operation, { id: randomUUID(), tenantId: operation.context.tenantId, credentialId: null,
        verificationKind: 'wallet-multi-sd-jwt', outcome: valid ? 'valid' : 'invalid', occurredAt,
        evidence: { checks, disclosedPaths: items.flatMap((item) => item.disclosedPaths), failedChecks: checks.filter((item) => !item.passed).map((item) => item.key),
          presentationId, credentialIds: identifiers } });
      return { valid, presentationId, credentialId: null, checkedAt: occurredAt, checks, credentials: items };
    });
  }

  async finish(operation, kind, credentialId, checks, disclosedPaths, extra = {}) {
    const checkedAt = new Date().toISOString(); const valid = checks.every((item) => item.passed);
    await this.verificationLogRepository.append(operation, { id: randomUUID(), tenantId: operation.context.tenantId, credentialId,
      verificationKind: kind, outcome: valid ? 'valid' : 'invalid', occurredAt: checkedAt,
      evidence: { checks, disclosedPaths, failedChecks: checks.filter((item) => !item.passed).map((item) => item.key) } });
    return { valid, credentialId, checkedAt, checks, disclosedPaths: structuredClone(disclosedPaths || []), ...extra };
  }
}
