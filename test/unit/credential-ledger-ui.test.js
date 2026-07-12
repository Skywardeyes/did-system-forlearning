import test from 'node:test';
import assert from 'node:assert/strict';
import { credentialRows, verificationFailureNote, verificationRows } from '../../public/credential-ledger-ui.js';

const helpers = { escapeHtml: String, formatDate: String, short: String };

test('credentialRows renders lifecycle actions', () => {
  const html = credentialRows([{ id: 'vc-1', status: 'active', issuedAt: '2026-01-01', credential: { credentialSubject: { name: '张晓明', course: 'VC' } } }], helpers);
  assert.match(html, /data-vc-action="suspend"/);
  assert.match(html, /data-revoke="vc-1"/);
});

test('verificationFailureNote renders readable reasons and fallbacks', () => {
  assert.equal(verificationFailureNote({ valid: true }), '全部检查通过');
  assert.match(verificationFailureNote({ valid: false, failedChecks: ['signature', 'credentialStatus'] }), /签名无效.*凭证状态不可用/);
  assert.match(verificationFailureNote({ valid: false, failedChecks: ['futureCheck'] }), /未知检查项/);
  assert.equal(verificationFailureNote({ valid: false }), '未提供具体失败原因');
});

test('verificationRows renders result, credential and note', () => {
  const html = verificationRows([{ credentialId: 'vc-1', valid: false, failedChecks: ['signature'], checkedAt: '2026-01-01' }], helpers);
  assert.match(html, /vc-1/);
  assert.match(html, /验证失败/);
  assert.match(html, /签名无效/);
});
