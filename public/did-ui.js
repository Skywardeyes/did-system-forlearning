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
      <div class="identity-field"><span>公钥 JWK</span><pre>${publicJwk}</pre></div>
      <div class="identity-actions"><button class="text-button" data-document="${escapeHtml(item.id)}">查看 DID Document</button><span class="count">${formatDate(item.createdAt)}</span></div>
    </article>`;
}
