export async function resetDemo(request) {
  const response = await request.post('/api/demo/reset');
  if (!response.ok()) throw new Error(`reset failed: ${response.status()}`);
  return response.json();
}

export async function createDid(request, input) {
  const response = await request.post('/api/dids', { data: input });
  if (!response.ok()) throw new Error(`create DID failed: ${response.status()}`);
  return response.json();
}

export async function issueCredential(request, input) {
  const response = await request.post('/api/credentials', { data: input });
  if (!response.ok()) throw new Error(`issue failed: ${response.status()}`);
  return response.json();
}

export async function seedDids(request, count) {
  const results = [];
  for (let index = 0; index < count; index += 1) results.push(await createDid(request, { name: `分页身份${String(index).padStart(2, '0')}`, role: index % 2 ? 'holder' : 'issuer', method: 'example' }));
  return results;
}

export async function openView(page, view) {
  await page.goto('/');
  await page.locator(`[data-view="${view}"]`).click();
}
