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
