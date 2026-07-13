import { completeDidCreation, renderDidCard } from './did-ui.js';
import { applyListAction, createListState, renderPagination } from './list-ui.js';
import { applyLogFilter, createLogFilters, renderLogRow } from './log-ui.js';
import { credentialRows, verificationRows } from './credential-ledger-ui.js';

const state = { dids: [], credentials: [], verificationLogs: [], disclosureVerificationLogs: [], structuredLogs: [], selectedCredential: null };
const listStates = { did: createListState(), vc: createListState(), log: createListState(), disclosureLog: createListState() };
const listMeta = { did: {}, vc: {}, log: {}, disclosureLog: {} };
const structuredLogFilters = createLogFilters();
const structuredLogMeta = {};
const titles = { overview: '运行总览', identities: 'DID 身份', issue: '凭证签发', verify: '凭证验证', disclosure: '选择性披露', logs: '日志中心' };

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const short = (value, length = 16) => value ? `${value.slice(0, length)}…${value.slice(-6)}` : '-';
const formatDate = (value) => value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '-';

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || '请求失败');
  return body;
}

function toast(message, error = false) {
  const element = $('#toast');
  element.textContent = message;
  element.className = error ? 'show error' : 'show';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.className = ''; }, 2600);
}

function openJson(title, value) {
  $('#dialog-title').textContent = title;
  $('#dialog-json').textContent = JSON.stringify(value, null, 2);
  $('#json-dialog').showModal();
}

function navigate(view) {
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  $$('.view').forEach((item) => item.classList.toggle('active', item.id === `view-${view}`));
  $('#page-title').textContent = titles[view];
}

function render() {
  $('#stat-dids').textContent = listMeta.did.total ?? state.dids.length;
  $('#stat-vcs').textContent = listMeta.vc.total ?? state.credentials.length;
  $('#stat-active').textContent = state.credentials.filter((item) => item.status === 'active').length;
  $('#stat-checks').textContent = state.verificationLogs.length;
  $('#did-count').textContent = `${state.dids.length} 个身份`;

  renderDids();
  renderCredentials();
  renderLogs();
  renderDisclosureLogs();
  renderStructuredLogs();
  renderSelects();
  renderDisclosureSelect();
  $('#did-pagination').innerHTML = renderPagination(listMeta.did, { id: 'did', pageSize: listStates.did.pageSize });
  $('#vc-pagination').innerHTML = renderPagination(listMeta.vc, { id: 'vc', pageSize: listStates.vc.pageSize });
  $('#issue-vc-pagination').innerHTML = renderPagination(listMeta.vc, { id: 'issue-vc', pageSize: listStates.vc.pageSize });
  $('#log-pagination').innerHTML = renderPagination(listMeta.log, { id: 'log', pageSize: listStates.log.pageSize });
  $('#verify-log-pagination').innerHTML = renderPagination(listMeta.log, { id: 'verify-log', pageSize: listStates.log.pageSize });
  $('#disclosure-log-pagination').innerHTML = renderPagination(listMeta.disclosureLog, { id: 'disclosure-log', pageSize: listStates.disclosureLog.pageSize });
  bindPagination('did'); bindPagination('vc'); bindPagination('log');
  bindAliasPagination('issue-vc', 'vc'); bindAliasPagination('verify-log', 'log');
  bindAliasPagination('disclosure-log', 'disclosureLog');
  $('#issue-vc-search').value = listStates.vc.search;
  $('#verify-log-search').value = listStates.log.search;
  $('#disclosure-log-search').value = listStates.disclosureLog.search;
}

function renderDisclosureLogs() {
  const tbody = $('#disclosure-verification-log-table');
  if (!state.disclosureVerificationLogs.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无披露验证记录</td></tr>';
    return;
  }
  const fieldLabels = { 'credentialSubject.name': '姓名', 'credentialSubject.course': '课程', 'credentialSubject.completionDate': '完成日期', 'credentialSubject.achievement': '完成状态' };
  const failureLabels = { format: '格式无效', issuer: 'Issuer 不存在', didStatus: 'Issuer 已停用', keyVersion: '密钥不可用', manifestSignature: '摘要清单签名无效', disclosedClaims: '公开字段摘要不一致', validity: '凭证不在有效期', credentialStatus: '凭证状态不可用' };
  tbody.innerHTML = state.disclosureVerificationLogs.map((log) => {
    const disclosed = (log.disclosedPaths || []).map((path) => fieldLabels[path] || path).join('、') || '无';
    const failures = log.valid ? '全部检查通过' : (log.failedChecks || []).map((key) => failureLabels[key] || key).join('、');
    return `<tr><td title="${escapeHtml(log.credentialId || '')}">${log.credentialId ? short(log.credentialId, 22) : '未知凭证'}</td><td><span class="status ${log.valid ? 'active' : 'revoked'}">${log.valid ? '验证通过' : '验证失败'}</span></td><td>${escapeHtml(disclosed)}</td><td>${escapeHtml(failures)}</td><td>${formatDate(log.checkedAt)}</td></tr>`;
  }).join('');
}

function renderDisclosureSelect() {
  const select = $('#disclosure-credential');
  const previous = select.value;
  const records = state.credentials.filter((item) => item.selectiveDisclosureAvailable && item.status === 'active');
  select.innerHTML = `<option value="">请选择状态为 active 且支持选择性披露的凭证</option>${records.map((record) => `<option value="${escapeHtml(record.id)}">${escapeHtml(record.credential.credentialSubject.name)} · ${escapeHtml(record.credential.credentialSubject.course)} · ${escapeHtml(record.status)}</option>`).join('')}`;
  if (records.some((item) => item.id === previous)) select.value = previous;
  else if (records[0]) select.value = records[0].id;
}

function renderStructuredLogs() {
  const tbody = $('#structured-log-table');
  tbody.innerHTML = state.structuredLogs.length
    ? state.structuredLogs.map((entry) => renderLogRow(entry, { formatDate })).join('')
    : '<tr><td colspan="6" class="empty-state">当前条件下没有日志</td></tr>';
  $('#structured-log-pagination').innerHTML = renderPagination(structuredLogMeta, { id: 'structured-log', pageSize: structuredLogFilters.pageSize });
  $('#structured-log-pagination [data-page="prev"]')?.addEventListener('click', () => changeStructuredLogs({ type: 'page', value: structuredLogMeta.page - 1 }));
  $('#structured-log-pagination [data-page="next"]')?.addEventListener('click', () => changeStructuredLogs({ type: 'page', value: structuredLogMeta.page + 1 }));
  $('#structured-log-page-size')?.addEventListener('change', (event) => changeStructuredLogs({ type: 'pageSize', value: event.target.value }));
  $$('[data-log-detail]').forEach((button) => button.addEventListener('click', async () => {
    try { openJson('结构化日志详情', await api(`/api/logs/${encodeURIComponent(button.dataset.logDetail)}`)); }
    catch (error) { toast(error.message, true); }
  }));
}

function renderDids() {
  const list = $('#did-list');
  if (!state.dids.length) { list.className = 'identity-list empty-state'; list.textContent = '尚未创建 DID'; return; }
  list.className = 'identity-list';
  list.innerHTML = state.dids
    .map((item) => renderDidCard(item, { escapeHtml, formatDate }))
    .join('');
  $$('[data-document]').forEach((button) => button.addEventListener('click', () => {
    const identity = state.dids.find((item) => item.id === button.dataset.document);
    openJson(`${identity.name} · DID Document`, identity.document);
  }));
  $$('[data-update-did]').forEach((button) => button.addEventListener('click', () => updateDid(button.dataset.updateDid)));
  $$('[data-rotate-did]').forEach((button) => button.addEventListener('click', () => didAction(button.dataset.rotateDid, 'rotate-key', '密钥轮换成功')));
  $$('[data-deactivate-did]').forEach((button) => button.addEventListener('click', () => didAction(button.dataset.deactivateDid, 'deactivate', 'DID 已停用', true)));
}

function renderCredentials() {
  const tables = [$('#credential-table'), $('#issue-credential-table')];
  if (!state.credentials.length) {
    tables.forEach((tbody) => { tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无凭证，请先创建身份并签发</td></tr>'; });
    return;
  }
  const rows = credentialRows(state.credentials, { escapeHtml, formatDate, short });
  tables.forEach((tbody) => { tbody.innerHTML = rows; });
  $$('[data-open-vc]').forEach((button) => button.addEventListener('click', () => {
    const record = state.credentials.find((item) => item.id === button.dataset.openVc);
    openJson('可验证凭证 VC', record.credential);
  }));
  $$('[data-revoke]').forEach((button) => button.addEventListener('click', () => revoke(button.dataset.revoke)));
  $$('[data-vc-action]').forEach((button) => button.addEventListener('click', () => credentialAction(button.dataset.id, button.dataset.vcAction)));
}

function renderLogs() {
  const container = $('#recent-logs');
  if (!state.verificationLogs.length) {
    container.className = 'activity-list empty-state'; container.textContent = '暂无验证记录';
    $('#verification-log-table').innerHTML = '<tr><td colspan="4" class="empty-state">暂无验证记录</td></tr>';
    return;
  }
  container.className = 'activity-list';
  container.innerHTML = state.verificationLogs.slice(0, 4).map((log) => `<div class="activity-item"><i class="${log.valid ? 'ok' : ''}"></i><strong>${log.valid ? '验证通过' : '验证失败'}</strong><span>${formatDate(log.checkedAt)}</span></div>`).join('');
  $('#verification-log-table').innerHTML = verificationRows(state.verificationLogs, { escapeHtml, formatDate, short });
}

function renderSelects() {
  const fill = (selector, role, placeholder) => {
    const select = $(selector);
    const previous = select.value;
    const items = state.dids.filter((item) => item.role === role && item.status !== 'deactivated');
    select.innerHTML = `<option value="">${placeholder}</option>${items.map((item) => `<option value="${item.did}">${escapeHtml(item.name)} · ${escapeHtml(item.method)} · ${short(item.did, 13)}</option>`).join('')}`;
    if (items.some((item) => item.did === previous)) select.value = previous;
    else if (items[0]) select.value = items[0].did;
  };
  fill('#issuer-select', 'issuer', '请选择 Issuer');
  fill('#holder-select', 'holder', '请选择 Holder');
  const holder = state.dids.find((item) => item.did === $('#holder-select').value);
  if (holder && !$('[name="studentName"]').value) $('[name="studentName"]').value = holder.name;
}

function renderVerification(result) {
  const badge = $('#result-badge');
  badge.className = `result-badge ${result.valid ? 'valid' : 'invalid'}`;
  badge.textContent = result.valid ? '验证通过' : '验证失败';
  const container = $('#verify-results');
  container.className = 'check-list';
  container.innerHTML = result.checks.map((check) => `<div class="check-item ${check.passed ? '' : 'failed'}"><div class="check-icon">${check.passed ? '✓' : '×'}</div><div><strong>${check.label}</strong><small>${escapeHtml(check.detail)}</small></div></div>`).join('');
}

function renderDisclosureVerification(result) {
  const badge = $('#disclosure-result-badge');
  badge.className = `result-badge ${result.valid ? 'valid' : 'invalid'}`;
  badge.textContent = result.valid ? '验证通过' : '验证失败';
  const container = $('#disclosure-results');
  container.className = 'check-list';
  container.innerHTML = result.checks.map((check) => `<div class="check-item ${check.passed ? '' : 'failed'}"><div class="check-icon">${check.passed ? '✓' : '×'}</div><div><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(check.detail)}</small></div></div>`).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

async function refresh() {
  const base = await api('/api/state');
  const load = (type, endpoint) => api(`${endpoint}?${new URLSearchParams(listStates[type])}`);
  const [dids, credentials, logs, disclosureLogs, structured] = await Promise.all([load('did', '/api/dids'), load('vc', '/api/credentials'), load('log', '/api/verification-logs'), load('disclosureLog', '/api/disclosure-verification-logs'), api(`/api/logs?${new URLSearchParams(structuredLogFilters)}`)]);
  Object.assign(state, base, { dids: dids.items, credentials: credentials.items, verificationLogs: logs.items, disclosureVerificationLogs: disclosureLogs.items, structuredLogs: structured.items });
  Object.assign(listMeta.did, dids); Object.assign(listMeta.vc, credentials); Object.assign(listMeta.log, logs); Object.assign(listMeta.disclosureLog, disclosureLogs);
  Object.assign(structuredLogMeta, structured);
  render();
}

async function changeStructuredLogs(action) {
  Object.assign(structuredLogFilters, applyLogFilter(structuredLogFilters, action));
  await refresh();
}

function bindPagination(type) {
  const container = $(`#${type}-pagination`);
  container.querySelector('[data-page="prev"]')?.addEventListener('click', () => changeList(type, { type: 'page', value: listMeta[type].page - 1 }));
  container.querySelector('[data-page="next"]')?.addEventListener('click', () => changeList(type, { type: 'page', value: listMeta[type].page + 1 }));
  container.querySelector(`#${type}-page-size`)?.addEventListener('change', (event) => changeList(type, { type: 'pageSize', value: event.target.value }));
}

function bindAliasPagination(prefix, type) {
  const container = $(`#${prefix}-pagination`);
  container.querySelector('[data-page="prev"]')?.addEventListener('click', () => changeList(type, { type: 'page', value: listMeta[type].page - 1 }));
  container.querySelector('[data-page="next"]')?.addEventListener('click', () => changeList(type, { type: 'page', value: listMeta[type].page + 1 }));
  container.querySelector(`#${prefix}-page-size`)?.addEventListener('change', (event) => changeList(type, { type: 'pageSize', value: event.target.value }));
}

async function changeList(type, action) { Object.assign(listStates[type], applyListAction(listStates[type], action)); await refresh(); }

function bindSearchControls(prefix, submit) {
  const input = $(`#${prefix}-search`);
  const clear = $(`#${prefix}-search-clear`);
  const syncClear = () => { clear.hidden = input.value.length === 0; };
  input.addEventListener('input', syncClear);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); submit(input.value); }
  });
  $(`#${prefix}-search-submit`).addEventListener('click', () => submit(input.value));
  clear.addEventListener('click', () => {
    input.value = '';
    syncClear();
    input.focus();
    submit('');
  });
  syncClear();
}

for (const type of ['did', 'vc', 'log']) {
  bindSearchControls(type, (value) => changeList(type, { type: 'search', value }));
}
bindSearchControls('issue-vc', (value) => changeList('vc', { type: 'search', value }));
bindSearchControls('verify-log', (value) => changeList('log', { type: 'search', value }));
bindSearchControls('disclosure-log', (value) => changeList('disclosureLog', { type: 'search', value }));

bindSearchControls('structured-log', (value) => changeStructuredLogs({ type: 'search', value }));

for (const [id, type] of [['structured-log-type', 'type'], ['structured-log-success', 'success'], ['structured-log-level', 'level'], ['structured-log-module', 'module'], ['structured-log-start', 'startTime'], ['structured-log-end', 'endTime']]) {
  $(`#${id}`).addEventListener('change', (event) => changeStructuredLogs({ type, value: event.target.value }));
}

$('#clear-logs').addEventListener('click', async () => {
  if (!confirm('清空后无法恢复，确认继续？')) return;
  try { await api('/api/logs', { method: 'DELETE', body: JSON.stringify({ confirm: true }) }); await refresh(); toast('日志已清空并保留清理摘要'); }
  catch (error) { toast(error.message, true); }
});

async function revoke(id) {
  if (!confirm('撤销后该凭证将无法通过验证，确认继续？')) return;
  try { await api(`/api/credentials/${encodeURIComponent(id)}/revoke`, { method: 'POST' }); await refresh(); toast('凭证已撤销'); }
  catch (error) { toast(error.message, true); }
}

async function updateDid(id) {
  const identity = state.dids.find((item) => item.id === id);
  const name = prompt('请输入新名称', identity.name);
  if (!name) return;
  try { await api(`/api/dids/${id}`, { method: 'PATCH', body: JSON.stringify({ name, expectedVersion: identity.version }) }); await refresh(); toast('DID 更新成功'); } catch (error) { toast(error.message, true); }
}

async function didAction(id, action, message, confirmRequired = false) {
  const identity = state.dids.find((item) => item.id === id);
  if (confirmRequired && !confirm('停用不可恢复，确认继续？')) return;
  try { await api(`/api/dids/${id}/${action}`, { method: 'POST', body: JSON.stringify({ expectedVersion: identity.version }) }); await refresh(); toast(message); } catch (error) { toast(error.message, true); }
}

async function credentialAction(id, action) {
  const body = action === 'replace' ? { courseName: prompt('请输入更新后的课程名称') } : {};
  if (action === 'replace' && !body.courseName) return;
  try { await api(`/api/credentials/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: JSON.stringify(body) }); await refresh(); toast('凭证状态已更新'); } catch (error) { toast(error.message, true); }
}

$$('.nav-item').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.view)));
$$('[data-go]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.go)));
$('#dialog-close').addEventListener('click', () => $('#json-dialog').close());
$('#holder-select').addEventListener('change', () => {
  const holder = state.dids.find((item) => item.did === $('#holder-select').value);
  if (holder) $('[name="studentName"]').value = holder.name;
});

$('#did-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const body = Object.fromEntries(new FormData(form));
  try { await completeDidCreation({ form, body, api, refresh, notify: toast }); }
  catch (error) { toast(error.message, true); }
});

$('#issue-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const record = await api('/api/credentials', { method: 'POST', body: JSON.stringify(body) });
    state.selectedCredential = record.credential;
    $('#vc-preview').textContent = JSON.stringify(record.credential, null, 2);
    $('#verify-input').value = JSON.stringify(record.credential, null, 2);
    await refresh(); toast('VC 已使用 Issuer 私钥签发');
  } catch (error) { toast(error.message, true); }
});

$('#verify-button').addEventListener('click', async () => {
  try {
    const credential = JSON.parse($('#verify-input').value);
    const result = await api('/api/verify', { method: 'POST', body: JSON.stringify({ credential }) });
    renderVerification(result); await refresh(); toast(result.valid ? '凭证验证通过' : '凭证验证失败', !result.valid);
  } catch (error) { toast(error instanceof SyntaxError ? 'VC JSON 格式无效' : error.message, true); }
});

$('#load-latest').addEventListener('click', () => {
  const latest = state.credentials[0]?.credential;
  if (!latest) return toast('当前没有可载入的凭证', true);
  $('#verify-input').value = JSON.stringify(latest, null, 2);
  toast('已载入最新凭证');
});

$('#tamper-name').addEventListener('click', () => {
  try { const credential = JSON.parse($('#verify-input').value); credential.credentialSubject.name = `${credential.credentialSubject.name}（已修改）`; $('#verify-input').value = JSON.stringify(credential, null, 2); toast('已修改姓名，可执行验证观察签名失败'); }
  catch { toast('请先载入有效的 VC JSON', true); }
});

$('#generate-disclosure').addEventListener('click', async () => {
  const credentialId = $('#disclosure-credential').value;
  const paths = $$('.disclosure-fields input:checked').map((input) => input.value);
  const format = $('#disclosure-format').value;
  if (!credentialId) return toast('请选择一张支持选择性披露的凭证', true);
  if (!paths.length) return toast('请至少选择一个公开字段', true);
  try {
    const response = await api(`/api/credentials/${encodeURIComponent(credentialId)}/${format === 'sd-jwt' ? 'sd-jwt' : 'disclosures'}`, { method: 'POST', body: JSON.stringify({ paths }) });
    const presentation = format === 'sd-jwt' ? { format: 'sd-jwt', sdJwt: response.sdJwt } : response;
    $('#disclosure-input').value = JSON.stringify(presentation, null, 2);
    const labels = { 'credentialSubject.name': '学员姓名', 'credentialSubject.course': '课程名称', 'credentialSubject.completionDate': '完成日期', 'credentialSubject.achievement': '完成状态' };
    const hidden = Object.entries(labels).filter(([path]) => !paths.includes(path)).map(([, label]) => label);
    const formatLabel = format === 'sd-jwt' ? 'SD-JWT（不含 Holder key binding）' : '教学版摘要证明';
    $('#disclosure-privacy-summary').textContent = `${formatLabel}：已公开：${paths.map((path) => labels[path]).join('、')}；未公开：${hidden.join('、') || '无'}。披露证明不包含完整 VC。`;
    $('#disclosure-result-badge').className = 'result-badge idle';
    $('#disclosure-result-badge').textContent = '等待验证';
    $('#disclosure-results').className = 'check-list empty-state';
    $('#disclosure-results').textContent = '披露证明已生成，请执行验证。';
    toast(`${formatLabel} 已生成`);
  } catch (error) { toast(error.message, true); }
});

$('#verify-disclosure').addEventListener('click', async () => {
  try {
    const presentation = JSON.parse($('#disclosure-input').value);
    const result = presentation.format === 'sd-jwt'
      ? await api('/api/sd-jwt/verify', { method: 'POST', body: JSON.stringify({ sdJwt: presentation.sdJwt }) })
      : await api('/api/disclosures/verify', { method: 'POST', body: JSON.stringify({ presentation }) });
    renderDisclosureVerification(result);
    await refresh();
    toast(result.valid ? '选择性披露验证通过' : '选择性披露验证失败', !result.valid);
  } catch (error) { toast(error instanceof SyntaxError ? '披露证明 JSON 格式无效' : error.message, true); }
});

$('#tamper-disclosure').addEventListener('click', () => {
  try {
    const presentation = JSON.parse($('#disclosure-input').value);
    if (presentation.format === 'sd-jwt') {
      const position = presentation.sdJwt.lastIndexOf('~') - 1;
      if (position < 0) return toast('SD-JWT 内容无效', true);
      const original = presentation.sdJwt[position];
      presentation.sdJwt = `${presentation.sdJwt.slice(0, position)}${original === 'A' ? 'B' : 'A'}${presentation.sdJwt.slice(position + 1)}`;
      $('#disclosure-input').value = JSON.stringify(presentation, null, 2);
      return toast('已篡改 SD-JWT 披露项，可再次验证观察摘要失败');
    }
    const course = presentation.disclosedClaims?.find((item) => item.path === 'credentialSubject.course');
    if (!course) return toast('当前证明没有公开课程字段', true);
    course.value = `${course.value}（已修改）`;
    $('#disclosure-input').value = JSON.stringify(presentation, null, 2);
    toast('已修改公开课程，可再次验证观察摘要失败');
  } catch { toast('请先生成有效的披露证明', true); }
});

$('#copy-vc').addEventListener('click', async () => {
  const text = $('#vc-preview').textContent;
  if (!text.trim().startsWith('{')) return toast('尚无可复制的凭证', true);
  await navigator.clipboard.writeText(text); toast('VC JSON 已复制');
});

$('#reset-demo').addEventListener('click', async () => {
  if (!confirm('这会清空现有本地演示数据，确认继续？')) return;
  try { const demo = await api('/api/demo/reset', { method: 'POST' }); $('#vc-preview').textContent = JSON.stringify(demo.credential.credential, null, 2); $('#verify-input').value = JSON.stringify(demo.credential.credential, null, 2); await refresh(); toast('演示数据已准备完成'); }
  catch (error) { toast(error.message, true); }
});

const now = new Date();
$('[name="completionDate"]').value = now.toISOString().slice(0, 10);
const nextYear = new Date(now.getTime() + 365 * 86400000);
$('[name="validUntil"]').value = nextYear.toISOString().slice(0, 16);
setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false }); }, 1000);

refresh().catch((error) => toast(`无法连接本地服务：${error.message}`, true));
