const state = { dids: [], credentials: [], verificationLogs: [], selectedCredential: null };
const titles = { overview: '运行总览', identities: 'DID 身份', issue: '凭证签发', verify: '凭证验证' };

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
  $('#stat-dids').textContent = state.dids.length;
  $('#stat-vcs').textContent = state.credentials.length;
  $('#stat-active').textContent = state.credentials.filter((item) => item.status === 'active').length;
  $('#stat-checks').textContent = state.verificationLogs.length;
  $('#did-count').textContent = `${state.dids.length} 个身份`;

  renderDids();
  renderCredentials();
  renderLogs();
  renderSelects();
}

function renderDids() {
  const list = $('#did-list');
  if (!state.dids.length) { list.className = 'identity-list empty-state'; list.textContent = '尚未创建 DID'; return; }
  list.className = 'identity-list';
  list.innerHTML = state.dids.map((item) => `
    <article class="identity-card">
      <div class="identity-head"><span class="role-tag ${item.role}">${item.role.toUpperCase()}</span><strong>${escapeHtml(item.name)}</strong></div>
      <code title="${item.did}">${item.did}</code>
      <div class="identity-actions"><button class="text-button" data-document="${item.id}">查看 DID Document</button><span class="count">${formatDate(item.createdAt)}</span></div>
    </article>`).join('');
  $$('[data-document]').forEach((button) => button.addEventListener('click', () => {
    const identity = state.dids.find((item) => item.id === button.dataset.document);
    openJson(`${identity.name} · DID Document`, identity.document);
  }));
}

function renderCredentials() {
  const tbody = $('#credential-table');
  if (!state.credentials.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无凭证，请先创建身份并签发</td></tr>';
    return;
  }
  tbody.innerHTML = [...state.credentials].reverse().map((record) => `
    <tr>
      <td><strong>${escapeHtml(record.credential.credentialSubject.name)}</strong><small title="${record.id}">${short(record.id, 18)}</small></td>
      <td>${escapeHtml(record.credential.credentialSubject.course)}</td>
      <td>${formatDate(record.issuedAt)}</td>
      <td><span class="status ${record.status}">${record.status === 'revoked' ? '已撤销' : '有效'}</span></td>
      <td><button class="table-action" data-open-vc="${record.id}">查看</button>${record.status === 'active' ? ` · <button class="table-action" data-revoke="${record.id}">撤销</button>` : ''}</td>
    </tr>`).join('');
  $$('[data-open-vc]').forEach((button) => button.addEventListener('click', () => {
    const record = state.credentials.find((item) => item.id === button.dataset.openVc);
    openJson('可验证凭证 VC', record.credential);
  }));
  $$('[data-revoke]').forEach((button) => button.addEventListener('click', () => revoke(button.dataset.revoke)));
}

function renderLogs() {
  const container = $('#recent-logs');
  if (!state.verificationLogs.length) { container.className = 'activity-list empty-state'; container.textContent = '暂无验证记录'; return; }
  container.className = 'activity-list';
  container.innerHTML = state.verificationLogs.slice(0, 4).map((log) => `<div class="activity-item"><i class="${log.valid ? 'ok' : ''}"></i><strong>${log.valid ? '验证通过' : '验证失败'}</strong><span>${formatDate(log.checkedAt)}</span></div>`).join('');
}

function renderSelects() {
  const fill = (selector, role, placeholder) => {
    const select = $(selector);
    const previous = select.value;
    const items = state.dids.filter((item) => item.role === role);
    select.innerHTML = `<option value="">${placeholder}</option>${items.map((item) => `<option value="${item.did}">${escapeHtml(item.name)} · ${short(item.did, 13)}</option>`).join('')}`;
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

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

async function refresh() {
  Object.assign(state, await api('/api/state'));
  render();
}

async function revoke(id) {
  if (!confirm('撤销后该凭证将无法通过验证，确认继续？')) return;
  try { await api(`/api/credentials/${encodeURIComponent(id)}/revoke`, { method: 'POST' }); await refresh(); toast('凭证已撤销'); }
  catch (error) { toast(error.message, true); }
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
  const body = Object.fromEntries(new FormData(event.currentTarget));
  try { await api('/api/dids', { method: 'POST', body: JSON.stringify(body) }); event.currentTarget.reset(); await refresh(); toast('DID 身份创建成功'); }
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
  const latest = state.credentials.at(-1)?.credential;
  if (!latest) return toast('当前没有可载入的凭证', true);
  $('#verify-input').value = JSON.stringify(latest, null, 2);
  toast('已载入最新凭证');
});

$('#tamper-name').addEventListener('click', () => {
  try { const credential = JSON.parse($('#verify-input').value); credential.credentialSubject.name = `${credential.credentialSubject.name}（已修改）`; $('#verify-input').value = JSON.stringify(credential, null, 2); toast('已修改姓名，可执行验证观察签名失败'); }
  catch { toast('请先载入有效的 VC JSON', true); }
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
