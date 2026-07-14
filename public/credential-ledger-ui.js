const FAILURE_REASONS = {
  format: '凭证格式无效', issuer: '签发方 DID 不存在', didStatus: 'DID 状态不可用',
  keyVersion: '签名密钥版本不可用', signature: '签名无效', validity: '凭证有效期无效',
  credentialStatus: '凭证状态不可用',
};

export function verificationFailureNote(log) {
  if (log.valid) return '全部检查通过';
  if (!log.failedChecks?.length) return '未提供具体失败原因';
  return log.failedChecks.map((key) => FAILURE_REASONS[key] || `未知检查项（${key}）`).join('、');
}

export function credentialRows(records, { escapeHtml, formatDate, short }) {
  return records.map((record) => {
    const subject = record.credential?.credentialSubject;
    const name = subject?.name || '受保护的凭证主体';
    const course = subject?.course || '需授权后查看';
    return `<tr>
    <td><strong>${escapeHtml(name)}</strong><small title="${escapeHtml(record.id)}">${short(record.id, 18)}</small></td>
    <td>${escapeHtml(course)}</td><td>${formatDate(record.issuedAt)}</td>
    <td><span class="status ${escapeHtml(record.status)}">${escapeHtml(record.status)}</span></td>
    <td><button class="table-action" data-open-vc="${escapeHtml(record.id)}">${subject ? '查看' : '授权查看'}</button>${record.status === 'active' ? ` · <button class="table-action" data-vc-action="suspend" data-id="${escapeHtml(record.id)}">暂停</button> · <button class="table-action" data-vc-action="replace" data-id="${escapeHtml(record.id)}">更新</button> · <button class="table-action" data-revoke="${escapeHtml(record.id)}">撤销</button>` : record.status === 'suspended' ? ` · <button class="table-action" data-vc-action="resume" data-id="${escapeHtml(record.id)}">恢复</button> · <button class="table-action" data-vc-action="replace" data-id="${escapeHtml(record.id)}">更新</button> · <button class="table-action" data-revoke="${escapeHtml(record.id)}">撤销</button>` : ''}</td>
  </tr>`;
  }).join('');
}

export function verificationRows(logs, { escapeHtml, formatDate, short }) {
  return logs.map((log) => `<tr><td title="${escapeHtml(log.credentialId || '')}">${log.credentialId ? short(log.credentialId, 22) : '未知凭证'}</td><td><span class="status ${log.valid ? 'active' : 'revoked'}">${log.valid ? '验证通过' : '验证失败'}</span></td><td>${escapeHtml(verificationFailureNote(log))}</td><td>${formatDate(log.checkedAt)}</td></tr>`).join('');
}
