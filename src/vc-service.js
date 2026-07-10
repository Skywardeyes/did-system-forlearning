import { randomUUID } from 'node:crypto';
import { createDidIdentity, signCredential, verifyCredentialSignature } from './crypto.js';
import { publicDid } from './store.js';

const VC_CONTEXT = ['https://www.w3.org/ns/credentials/v2'];

function resultItem(key, label, passed, detail) {
  return { key, label, passed, detail };
}

export class VcService {
  constructor(store) {
    this.store = store;
  }

  async getState() {
    const state = await this.store.load();
    return {
      dids: state.dids.map(publicDid),
      credentials: state.credentials,
      verificationLogs: state.verificationLogs.slice(-20).reverse(),
    };
  }

  async createDid(input) {
    const name = input?.name?.trim();
    const role = input?.role;
    if (!name) throw new Error('名称不能为空');
    if (!['issuer', 'holder'].includes(role)) throw new Error('角色必须是 issuer 或 holder');

    return this.store.update((state) => {
      const identity = createDidIdentity({ name, role });
      state.dids.push(identity);
      return publicDid(identity);
    });
  }

  async issueCredential(input) {
    return this.store.update((state) => {
      const issuer = state.dids.find((item) => item.did === input?.issuerDid && item.role === 'issuer');
      const holder = state.dids.find((item) => item.did === input?.holderDid && item.role === 'holder');
      if (!issuer) throw new Error('请选择有效的 Issuer DID');
      if (!holder) throw new Error('请选择有效的 Holder DID');

      const studentName = input?.studentName?.trim();
      const courseName = input?.courseName?.trim();
      if (!studentName || !courseName) throw new Error('学员姓名和课程名称不能为空');

      const now = new Date();
      const validUntil = input.validUntil ? new Date(input.validUntil) : new Date(now.getTime() + 365 * 86400000);
      const completionDate = input.completionDate || now.toISOString().slice(0, 10);
      if (Number.isNaN(validUntil.getTime())) throw new Error('有效期格式无效');

      const id = `urn:uuid:${randomUUID()}`;
      const credential = {
        '@context': VC_CONTEXT,
        id,
        type: ['VerifiableCredential', 'TrainingCompletionCredential'],
        issuer: issuer.did,
        validFrom: now.toISOString(),
        validUntil: validUntil.toISOString(),
        credentialSubject: {
          id: holder.did,
          name: studentName,
          course: courseName,
          completionDate,
          achievement: 'Completed',
        },
      };

      credential.proof = {
        type: 'EducationalEd25519Signature2026',
        cryptosuite: 'eddsa-stable-json-demo-2026',
        created: now.toISOString(),
        verificationMethod: issuer.document.assertionMethod[0],
        proofPurpose: 'assertionMethod',
        proofValue: signCredential(credential, issuer.privateJwk),
      };

      const record = {
        id,
        credential,
        status: 'active',
        issuedAt: now.toISOString(),
        revokedAt: null,
      };
      state.credentials.push(record);
      return record;
    });
  }

  async revokeCredential(id) {
    return this.store.update((state) => {
      const record = state.credentials.find((item) => item.id === id);
      if (!record) throw new Error('未找到指定凭证');
      if (record.status !== 'revoked') {
        record.status = 'revoked';
        record.revokedAt = new Date().toISOString();
      }
      return record;
    });
  }

  async verifyCredential(credential, { saveLog = true } = {}) {
    const state = await this.store.load();
    const checks = [];

    const hasShape = Boolean(
      credential &&
        typeof credential === 'object' &&
        credential.id &&
        Array.isArray(credential.type) &&
        credential.issuer &&
        credential.credentialSubject?.id &&
        credential.proof?.proofValue,
    );
    checks.push(resultItem('format', '格式完整性', hasShape, hasShape ? '必要字段完整' : '缺少 VC 必要字段'));

    const issuer = hasShape ? state.dids.find((item) => item.did === credential.issuer) : null;
    checks.push(
      resultItem(
        'issuer',
        'Issuer DID 解析',
        Boolean(issuer),
        issuer ? `已解析 ${issuer.name} 的 DID Document` : '本地 DID 注册表中不存在该签发方',
      ),
    );

    let signaturePassed = false;
    if (hasShape && issuer) {
      try {
        signaturePassed = verifyCredentialSignature(credential, issuer.publicJwk);
      } catch {
        signaturePassed = false;
      }
    }
    checks.push(
      resultItem(
        'signature',
        'Ed25519 签名',
        signaturePassed,
        signaturePassed ? '签名有效，凭证内容未被修改' : '签名无效或凭证内容已被修改',
      ),
    );

    const now = Date.now();
    const validFrom = Date.parse(credential?.validFrom);
    const validUntil = Date.parse(credential?.validUntil);
    const timePassed = Number.isFinite(validFrom) && Number.isFinite(validUntil) && validFrom <= now && now <= validUntil;
    checks.push(
      resultItem(
        'validity',
        '有效期',
        timePassed,
        timePassed ? `有效至 ${credential.validUntil}` : '凭证尚未生效、已经过期或时间格式无效',
      ),
    );

    const record = credential?.id ? state.credentials.find((item) => item.id === credential.id) : null;
    const notRevoked = Boolean(record) && record.status !== 'revoked';
    checks.push(
      resultItem(
        'revocation',
        '撤销状态',
        notRevoked,
        !record ? '本地签发记录中不存在该凭证' : notRevoked ? '凭证未撤销' : `已于 ${record.revokedAt} 撤销`,
      ),
    );

    const result = {
      valid: checks.every((item) => item.passed),
      credentialId: credential?.id || null,
      checkedAt: new Date().toISOString(),
      checks,
    };

    if (saveLog) {
      state.verificationLogs.push({
        id: randomUUID(),
        credentialId: result.credentialId,
        valid: result.valid,
        checkedAt: result.checkedAt,
        failedChecks: checks.filter((item) => !item.passed).map((item) => item.key),
      });
      state.verificationLogs = state.verificationLogs.slice(-100);
      await this.store.save(state);
    }
    return result;
  }

  async resetDemo() {
    await this.store.save({ dids: [], credentials: [], verificationLogs: [] });
    const issuer = await this.createDid({ name: '可信学习中心', role: 'issuer' });
    const holder = await this.createDid({ name: '张晓明', role: 'holder' });
    const credential = await this.issueCredential({
      issuerDid: issuer.did,
      holderDid: holder.did,
      studentName: '张晓明',
      courseName: '数字身份与可信凭证训练营',
      completionDate: new Date().toISOString().slice(0, 10),
    });
    return { issuer, holder, credential };
  }
}
