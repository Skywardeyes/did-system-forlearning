import { createHash, randomUUID } from 'node:crypto';
import { createClaimDigest, verifyCompactJwt, verifyCredentialSignature, verifyPayload } from '../crypto.js';

const ALLOWED_PATHS = new Set(['credentialSubject.name', 'credentialSubject.course', 'credentialSubject.completionDate']);
const SD_PATHS = { name: 'credentialSubject.name', course: 'credentialSubject.course', completion_date: 'credentialSubject.completionDate' };
const check = (key, label, passed, detail) => ({ key, label, passed: Boolean(passed), detail });

function effectiveStatus(record) {
  if (!record) return 'missing';
  if (Date.parse(record.validUntil) < Date.now() && !['replaced', 'revoked'].includes(record.status)) return 'expired';
  return record.status;
}

export class V2VerificationService {
  constructor({ unitOfWork, didRepository, didKeyVersionRepository, credentialRepository, verificationLogRepository }) {
    this.unitOfWork = unitOfWork; this.didRepository = didRepository; this.didKeyVersionRepository = didKeyVersionRepository;
    this.credentialRepository = credentialRepository; this.verificationLogRepository = verificationLogRepository;
  }

  async resolveIssuerKey(operation, issuerDid, proof) {
    const issuer = await this.didRepository.findByDid(operation, issuerDid);
    const key = issuer && proof && await this.didKeyVersionRepository.findByDidVersion(operation, issuer.id, Number(proof.keyVersion || 1));
    const matches = Boolean(key) && key.verificationMethod === proof?.verificationMethod;
    return { issuer, key: matches ? key : null };
  }

  async verifyCredential(context, credential) {
    return this.unitOfWork.run(context, async (operation) => {
      const format = Boolean(credential?.id && credential?.issuer && credential?.credentialSubject?.id && credential?.proof?.proofValue);
      const { issuer, key } = await this.resolveIssuerKey(operation, credential?.issuer, credential?.proof);
      const record = credential?.id ? await this.credentialRepository.findById(operation, credential.id) : null;
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
        return ALLOWED_PATHS.has(item.path) && typeof expected === 'string' && createClaimDigest(item.path, item.salt, item.value) === expected;
      });
      const record = presentation?.credentialId ? await this.credentialRepository.findById(operation, presentation.credentialId) : null;
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
      const format = Boolean(issuerJwt && trailing === '' && disclosures.length);
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
          const path = SD_PATHS[name]; const digest = createHash('sha256').update(disclosure).digest('base64url');
          if (!salt || !path || value === undefined || claimNames.has(name) || !payload._sd.includes(digest)) { disclosurePassed = false; break; }
          claimNames.add(name); paths.push(path);
        } catch { disclosurePassed = false; break; }
      }
      const now = Math.floor(Date.now() / 1000); const validity = Number.isFinite(payload?.nbf) && Number.isFinite(payload?.exp) && payload.nbf <= now && now <= payload.exp;
      const record = payload?.jti ? await this.credentialRepository.findById(operation, payload.jti) : null; const status = effectiveStatus(record);
      const checks = [check('format', 'SD-JWT 格式', format, format ? '紧凑序列化结构完整' : '格式无效'),
        check('issuer', 'Issuer DID 解析', issuer, issuer ? '已解析签发方' : '签发方不存在'),
        check('didStatus', 'Issuer DID 状态', issuer?.status === 'active', issuer?.status === 'active' ? '签发方有效' : '签发方停用或不存在'),
        check('keyVersion', '签名密钥解析', key, key ? '已解析公钥' : '密钥不可用'),
        check('signature', 'Issuer JWT 签名', signature, signature ? 'EdDSA JWS 签名有效' : 'JWT 签名、alg 或 typ 无效'),
        check('disclosedClaims', 'SD-JWT 披露摘要', disclosurePassed, disclosurePassed ? `${paths.length} 个披露项摘要一致` : '披露项无效或摘要不匹配'),
        check('validity', '凭证有效期', validity, validity && payload?.exp ? `有效至 ${new Date(payload.exp * 1000).toISOString()}` : '有效期无效'),
        check('credentialStatus', '凭证当前状态', status === 'active', status === 'active' ? '凭证当前有效' : `凭证状态为 ${status}`)];
      return this.finish(operation, 'sd-jwt', payload?.jti || null, checks, paths, { format: 'sd-jwt' });
    });
  }

  async finish(operation, kind, credentialId, checks, disclosedPaths, extra = {}) {
    const checkedAt = new Date().toISOString(); const valid = checks.every((item) => item.passed);
    await this.verificationLogRepository.append(operation, { id: randomUUID(), tenantId: operation.context.tenantId, credentialId,
      verificationKind: kind, outcome: valid ? 'valid' : 'invalid', occurredAt: checkedAt,
      evidence: { checks, disclosedPaths, failedChecks: checks.filter((item) => !item.passed).map((item) => item.key) } });
    return { valid, credentialId, checkedAt, checks, ...extra };
  }
}
