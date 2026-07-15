import { createHash, randomBytes, randomUUID } from 'node:crypto';
import QRCode from 'qrcode';

const hash = (value) => createHash('sha256').update(value).digest('hex');

export class NfcPresentationService {
  constructor({ pool, repository, holderDidDirectoryRepository, organizationRepository, verificationService, clock = () => Date.now() }) {
    this.pool = pool; this.repository = repository; this.holderDidDirectoryRepository = holderDidDirectoryRepository;
    this.organizationRepository = organizationRepository; this.verificationService = verificationService; this.clock = clock;
  }

  async issueChallenge(input = {}) {
    const holderDid = String(input.holderDid || '').trim();
    const targetOrganizationId = String(input.organizationId || '').trim();
    if (!targetOrganizationId) throw error('请选择接收证明的验证组织', 'VERIFIER_ORGANIZATION_REQUIRED');
    const holder = await this.holderDidDirectoryRepository.findByDid(this.pool, holderDid);
    if (!holder || holder.status !== 'active') throw error('请先把钱包的公开 Holder DID 发布到信证台', 'HOLDER_DID_NOT_PUBLISHED');
    const organization = await this.organizationRepository.findById({ connection: this.pool }, targetOrganizationId);
    if (!organization || organization.workspaceType !== 'organization' || organization.status !== 'active'
      || organization.verificationStatus !== 'approved') throw error('目标组织不存在或尚未审核通过', 'VERIFIER_ORGANIZATION_UNAVAILABLE');
    const challenge = randomBytes(32).toString('base64url'); const domain = `nfc-demo.verifier/${targetOrganizationId}`;
    const createdAt = new Date(this.clock()); const expiresAt = new Date(createdAt.getTime() + 5 * 60_000);
    const record = { id: randomUUID(), holderDid, targetOrganizationId, challenge, challengeHash: hash(challenge), domain,
      createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString() };
    await this.repository.create(this.pool, record);
    return { transferId: record.id, challenge, domain, expiresAt: record.expiresAt,
      targetOrganizationId, targetOrganizationName: organization.name };
  }

  async submit(transferId, input = {}) {
    const presentation = input.presentation; const record = await this.repository.find(this.pool, transferId);
    if (!record || record.status !== 'issued' || Date.parse(record.expiresAt) <= this.clock()) throw error('本次碰一碰已失效，请重新生成证明', 'NFC_TRANSFER_EXPIRED');
    if (presentation?.holderDid !== record.holderDid || presentation?.challenge !== record.challenge
      || presentation?.domain !== record.domain || hash(presentation.challenge || '') !== record.challengeHash) {
      throw error('出示证明与本次碰一碰会话不匹配', 'NFC_PRESENTATION_MISMATCH');
    }
    const submitted = await this.repository.submit(this.pool, transferId, presentation, new Date(this.clock()).toISOString());
    if (!submitted) throw error('本次证明已经发送或已经失效', 'NFC_TRANSFER_ALREADY_USED');
    return { transferId, delivered: true, holderDid: record.holderDid, submittedAt: submitted.submittedAt };
  }

  async latest(context) {
    const record = await this.repository.latestPending(this.pool, context.tenantId);
    return record ? { transferId: record.id, holderDid: record.holderDid, submittedAt: record.submittedAt,
      expiresAt: record.expiresAt, credentialCount: record.presentation?.verifiableCredentials?.length || 0 } : null;
  }

  async qrCode(transferId) {
    const record = await this.repository.find(this.pool, transferId);
    if (!record || record.status !== 'pending' || Date.parse(record.expiresAt) <= this.clock()) {
      throw error('二维码对应的出示证明不存在或已经失效', 'QR_PRESENTATION_UNAVAILABLE');
    }
    const payload = `didvc://present?transfer=${encodeURIComponent(record.id)}&expires=${encodeURIComponent(record.expiresAt)}`;
    const dataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, width: 320,
      color: { dark: '#17212aff', light: '#ffffffff' } });
    return { transferId: record.id, payload, dataUrl, expiresAt: record.expiresAt };
  }

  async verify(context, transferId) {
    const record = await this.repository.find(this.pool, transferId);
    if (!record || record.status !== 'pending' || !record.presentation) throw error('没有可验证的碰一碰证明', 'NFC_PRESENTATION_NOT_PENDING');
    if (record.targetOrganizationId !== context.tenantId) throw error('该证明不是发送给当前组织的', 'NFC_PRESENTATION_WRONG_ORGANIZATION');
    await this.verificationService.importWalletChallenge(context, { challenge: record.challenge, domain: record.domain, expiresAt: record.expiresAt });
    const result = await this.verificationService.verifyMultiWalletPresentation(context, record.presentation);
    await this.repository.complete(this.pool, transferId, context, result, new Date(this.clock()).toISOString());
    return result;
  }
}

function error(message, code) { const value = new Error(message); value.code = code; return value; }
