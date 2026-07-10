import { randomUUID } from 'node:crypto';
import { createDidKeyMaterial, signCredential, verifyCredentialSignature } from './crypto.js';
import { DidMethodRegistry } from './did-methods.js';
import { queryRecords } from './query.js';
import { publicDid } from './store.js';

const VC_CONTEXT = ['https://www.w3.org/ns/credentials/v2'];
const VC_TRANSITIONS = {
  active: new Set(['suspended', 'replaced', 'revoked']),
  suspended: new Set(['active', 'replaced', 'revoked']),
  replaced: new Set(), expired: new Set(), revoked: new Set(),
};

function resultItem(key, label, passed, detail) {
  return { key, label, passed, detail };
}

export class VcService {
  constructor(store, registry = new DidMethodRegistry()) {
    this.store = store;
    this.registry = registry;
  }

  async getState() {
    const state = await this.store.load();
    return {
      dids: state.dids.map((item) => publicDid(this.normalizeDid(item))),
      credentials: state.credentials.map((item) => ({ ...item, status: Date.parse(item.credential.validUntil) < Date.now() && !['replaced', 'revoked'].includes(item.status) ? 'expired' : item.status })),
      verificationLogs: state.verificationLogs.slice(-20).reverse(),
    };
  }

  async createDid(input) {
    const name = input?.name?.trim();
    const role = input?.role;
    if (!name) throw new Error('名称不能为空');
    if (!['issuer', 'holder'].includes(role)) throw new Error('角色必须是 issuer 或 holder');

    const method = input?.method || 'example';
    const adapter = this.registry.get(method);
    return this.store.update((state) => {
      const identity = adapter.create({ name, role });
      state.dids.push(identity);
      return publicDid(identity);
    });
  }

  normalizeDid(identity) {
    if (!identity.method) identity.method = identity.did?.startsWith('did:example:') ? 'example' : 'key';
    if (!identity.capabilities) identity.capabilities = this.registry.get(identity.method).capabilities();
    identity.status ||= 'active'; identity.version ||= 1; identity.keyVersion ||= 1; identity.keyHistory ||= [];
    return identity;
  }

  async listDids(options = {}) {
    const state = await this.store.load();
    return queryRecords(state.dids.map(publicDid), { ...options, fields: ['name', 'did', 'method', 'role', 'status'], timeField: 'createdAt' });
  }

  async listCredentials(options = {}) {
    const state = await this.store.load();
    const records = state.credentials.map((record) => ({
      ...record,
      status: Date.parse(record.credential.validUntil) < Date.now() && !['replaced', 'revoked'].includes(record.status) ? 'expired' : record.status,
      studentName: record.credential.credentialSubject.name,
      courseName: record.credential.credentialSubject.course,
      issuerDid: record.credential.issuer,
      holderDid: record.credential.credentialSubject.id,
    }));
    return queryRecords(records, { ...options, fields: ['id', 'studentName', 'courseName', 'issuerDid', 'holderDid', 'status'], timeField: 'issuedAt' });
  }

  async listVerificationLogs(options = {}) {
    const state = await this.store.load();
    const logs = state.verificationLogs.map((log) => ({ ...log, result: String(log.valid), failed: (log.failedChecks || []).join(',') }));
    return queryRecords(logs, { ...options, fields: ['credentialId', 'result', 'failed'], timeField: 'checkedAt' });
  }

  assertMutableDid(identity, expectedVersion) {
    if (!identity) throw new Error('未找到指定 DID');
    if (identity.status === 'deactivated') throw new Error('DID 已停用');
    if (identity.version !== Number(expectedVersion)) throw new Error('DID 版本冲突');
  }

  async updateDid(id, input) {
    return this.store.update((state) => {
      const identity = state.dids.find((item) => item.id === id);
      if (identity) this.normalizeDid(identity);
      if (identity && !identity.capabilities?.update) throw new Error('did:key 不支持更新');
      this.assertMutableDid(identity, input?.expectedVersion);
      const name = input?.name?.trim();
      if (input?.name !== undefined && !name) throw new Error('DID 名称不得为空');
      if (name) identity.name = name;
      if (input?.serviceEndpoint !== undefined) {
        identity.serviceEndpoint = input.serviceEndpoint?.trim() || null;
        if (identity.serviceEndpoint) {
          const url = new URL(identity.serviceEndpoint);
          const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
          if (url.protocol !== 'https:' && !localHttp) throw new Error('服务地址必须是 HTTPS 或本地 HTTP URL');
        }
        if (identity.serviceEndpoint) {
          identity.document.service = [{
            id: `${identity.did}#service`,
            type: 'LinkedDomains',
            serviceEndpoint: identity.serviceEndpoint,
          }];
        } else {
          delete identity.document.service;
        }
      }
      identity.version += 1;
      identity.updatedAt = new Date().toISOString();
      return publicDid(identity);
    });
  }

  async rotateDidKey(id, input) {
    return this.store.update((state) => {
      const identity = state.dids.find((item) => item.id === id);
      if (identity) this.normalizeDid(identity);
      if (identity && !identity.capabilities?.rotateKey) throw new Error('did:key 不支持密钥轮换');
      this.assertMutableDid(identity, input?.expectedVersion);
      const rotatedAt = new Date().toISOString();
      identity.keyHistory.push({
        version: identity.keyVersion || 1,
        verificationMethod: identity.document.assertionMethod[0],
        publicJwk: identity.publicJwk,
        privateJwk: identity.privateJwk,
        retiredAt: rotatedAt,
      });
      identity.version += 1;
      identity.keyVersion = (identity.keyVersion || 1) + 1;
      Object.assign(identity, createDidKeyMaterial(identity.did, identity.keyVersion));
      identity.updatedAt = rotatedAt;
      return publicDid(identity);
    });
  }

  async deactivateDid(id, input) {
    return this.store.update((state) => {
      const identity = state.dids.find((item) => item.id === id);
      if (identity) this.normalizeDid(identity);
      if (identity && !identity.capabilities?.deactivate) throw new Error('did:key 不支持停用');
      this.assertMutableDid(identity, input?.expectedVersion);
      identity.status = 'deactivated';
      identity.version += 1;
      identity.deactivatedAt = new Date().toISOString();
      identity.updatedAt = identity.deactivatedAt;
      return publicDid(identity);
    });
  }

  async issueCredential(input) {
    return this.store.update((state) => {
      return this.issueCredentialIntoState(state, input);
    });
  }

  issueCredentialIntoState(state, input, { replaces = null } = {}) {
      const issuer = state.dids.find((item) => item.did === input?.issuerDid && item.role === 'issuer');
      const holder = state.dids.find((item) => item.did === input?.holderDid && item.role === 'holder');
      if (!issuer) throw new Error('请选择有效的 Issuer DID');
      if (!holder) throw new Error('请选择有效的 Holder DID');
      if (issuer.status === 'deactivated') throw new Error('Issuer DID 已停用');
      if (holder.status === 'deactivated') throw new Error('Holder DID 已停用');

      const studentName = input?.studentName?.trim();
      const courseName = input?.courseName?.trim();
      if (!studentName || !courseName) throw new Error('学员姓名和课程名称不能为空');

      const now = new Date();
      const validUntil = input.validUntil ? new Date(input.validUntil) : new Date(now.getTime() + 365 * 86400000);
      const completionDate = input.completionDate || now.toISOString().slice(0, 10);
      if (Number.isNaN(validUntil.getTime())) throw new Error('有效期格式无效');
      if (validUntil.getTime() <= now.getTime()) throw new Error('有效期必须晚于生效时间');

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
        keyVersion: issuer.keyVersion || 1,
        proofPurpose: 'assertionMethod',
        proofValue: signCredential(credential, issuer.privateJwk),
      };

      const record = {
        id,
        credential,
        status: 'active',
        issuedAt: now.toISOString(),
        revokedAt: null,
        suspendedAt: null,
        resumedAt: null,
        replacedAt: null,
        replacedBy: null,
        replaces,
      };
      state.credentials.push(record);
      return record;
  }

  assertVcTransition(record, nextStatus) {
    if (!record) throw new Error('未找到指定凭证');
    if (Date.parse(record.credential.validUntil) < Date.now() && !['replaced', 'revoked'].includes(record.status)) record.status = 'expired';
    if (!VC_TRANSITIONS[record.status]?.has(nextStatus)) throw new Error(`凭证 ${record.status} 不允许转换为 ${nextStatus}`);
  }

  async suspendCredential(id) {
    return this.store.update((state) => {
      const record = state.credentials.find((item) => item.id === id);
      this.assertVcTransition(record, 'suspended');
      record.status = 'suspended'; record.suspendedAt = new Date().toISOString();
      return record;
    });
  }

  async resumeCredential(id) {
    return this.store.update((state) => {
      const record = state.credentials.find((item) => item.id === id);
      this.assertVcTransition(record, 'active');
      record.status = 'active'; record.resumedAt = new Date().toISOString();
      return record;
    });
  }

  async replaceCredential(id, input = {}) {
    return this.store.update((state) => {
      const record = state.credentials.find((item) => item.id === id);
      this.assertVcTransition(record, 'replaced');
      const subject = record.credential.credentialSubject;
      const next = this.issueCredentialIntoState(state, {
        issuerDid: record.credential.issuer,
        holderDid: subject.id,
        studentName: input.studentName ?? subject.name,
        courseName: input.courseName ?? subject.course,
        completionDate: input.completionDate ?? subject.completionDate,
        validUntil: input.validUntil ?? record.credential.validUntil,
      }, { replaces: record.id });
      record.status = 'replaced'; record.replacedAt = new Date().toISOString(); record.replacedBy = next.id;
      return next;
    });
  }

  async revokeCredential(id) {
    return this.store.update((state) => {
      const record = state.credentials.find((item) => item.id === id);
      this.assertVcTransition(record, 'revoked');
      record.status = 'revoked';
      record.revokedAt = new Date().toISOString();
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

    const didActive = Boolean(issuer) && issuer.status !== 'deactivated';
    checks.push(resultItem('didStatus', 'DID 当前状态', didActive, didActive ? 'Issuer DID 当前可用' : 'Issuer DID 不存在或已停用'));

    const keyVersion = Number(credential?.proof?.keyVersion || 1);
    const keyRecord = issuer && keyVersion === (issuer.keyVersion || 1)
      ? issuer
      : issuer?.keyHistory?.find((item) => item.version === keyVersion);
    const verificationMethodMatches = Boolean(keyRecord) && keyRecord.verificationMethod
      ? keyRecord.verificationMethod === credential?.proof?.verificationMethod
      : Boolean(keyRecord) && issuer.document.assertionMethod[0] === credential?.proof?.verificationMethod;
    const keyResolved = Boolean(keyRecord) && verificationMethodMatches;
    checks.push(resultItem('keyVersion', '密钥版本', keyResolved, keyResolved ? `已解析版本 ${keyVersion}` : '验证方法或密钥版本不存在'));

    let signaturePassed = false;
    if (hasShape && keyResolved) {
      try {
        signaturePassed = verifyCredentialSignature(credential, keyRecord.publicJwk);
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
    const effectiveStatus = record && Date.parse(record.credential.validUntil) < now && !['replaced', 'revoked'].includes(record.status) ? 'expired' : record?.status;
    const statusPassed = effectiveStatus === 'active';
    checks.push(
      resultItem(
        'credentialStatus',
        '凭证当前状态',
        statusPassed,
        !record ? '本地签发记录中不存在该凭证' : statusPassed ? '凭证当前有效' : `凭证状态为 ${effectiveStatus}`,
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
    const holder = await this.createDid({ name: '张晓明', role: 'holder', method: 'key' });
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
