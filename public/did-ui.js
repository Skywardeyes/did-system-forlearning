export async function completeDidCreation({ form, body, api, refresh, notify }) {
  const created = await api('/api/dids', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  form.reset();
  await refresh();
  notify(`DID 身份创建成功：${created.did}`);
  return created;
}

export function renderDidCard(item, { escapeHtml, formatDate }) {
  const publicJwk = escapeHtml(JSON.stringify(item.publicJwk, null, 2));
  return `
    <article class="identity-card">
      <div class="identity-head"><span class="role-tag ${escapeHtml(item.role)}">${escapeHtml(item.role.toUpperCase())}</span><strong>${escapeHtml(item.name)}</strong></div>
      <div class="identity-field"><span>完整 DID</span><code>${escapeHtml(item.did)}</code></div>
      <div class="identity-field"><span>Method / 状态 / 版本</span><code>${escapeHtml(item.method || 'key')} · ${escapeHtml(item.status || 'active')} · v${escapeHtml(item.version || 1)}</code></div>
      <div class="identity-field"><span>公钥 JWK</span><pre>${publicJwk}</pre></div>
      <div class="identity-actions"><button class="text-button" data-document="${escapeHtml(item.id)}">查看 DID Document</button>${item.capabilities?.update ? `<button class="text-button" data-update-did="${escapeHtml(item.id)}">更新</button><button class="text-button" data-rotate-did="${escapeHtml(item.id)}">轮换密钥</button><button class="text-button danger-text" data-deactivate-did="${escapeHtml(item.id)}">停用</button>` : '<span class="count">该 Method 不支持更新/轮换/停用</span>'}<span class="count">${formatDate(item.createdAt)}</span></div>
    </article>`;
}
