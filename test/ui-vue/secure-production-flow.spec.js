import { expect, test } from '@playwright/test';

const apiBase = `http://127.0.0.1:${process.env.PLAYWRIGHT_VUE_API_PORT || '4177'}`;

async function authenticatedPage(page, request) {
  const sessionResponse = await request.post(`${apiBase}/api/v2/session/local`, { data: {} });
  expect(sessionResponse.ok()).toBeTruthy();
  const session = await sessionResponse.json();
  const reset = await request.post(`${apiBase}/api/v2/demo/reset`, {
    headers: { authorization: `Bearer ${session.accessToken}` }, data: {},
  });
  expect(reset.ok()).toBeTruthy();
  await page.addInitScript((value) => sessionStorage.setItem('did-vc-session-v2', JSON.stringify(value)), session);
  return session;
}

test('Vue V2 UI protects lists, verifies a VC and records sensitive access', async ({ page, request }) => {
  await authenticatedPage(page, request);
  await page.goto('/');
  await expect(page.locator('.stats-grid article').nth(0).locator('strong')).not.toHaveText('0');

  await page.locator('a[href="/credentials"]').click();
  await expect(page.locator('table')).not.toContainText('演示学员');

  await page.locator('a[href="/verify"]').click();
  await page.getByRole('button', { name: '授权载入' }).click();
  await expect(page.locator('textarea')).toHaveValue(/credentialSubject/);
  await page.getByRole('button', { name: '执行完整验证' }).click();
  await expect(page.locator('.message')).toContainText('验证通过');

  await page.locator('a[href="/audit"]').click();
  await expect(page.locator('table')).toContainText('verification_preparation');
});

test('decrypted VC is cleared when leaving the verification route', async ({ page, request }) => {
  await authenticatedPage(page, request);
  await page.goto('/verify');
  await page.getByRole('button', { name: '授权载入' }).click();
  await expect(page.locator('textarea')).toHaveValue(/credentialSubject/);
  await page.locator('a[href="/"]').click();
  await page.locator('a[href="/verify"]').click();
  await expect(page.locator('textarea')).toHaveValue('');
  const stored = await page.evaluate(() => `${localStorage.getItem('did-vc-session-v2') || ''}${sessionStorage.getItem('did-vc-session-v2') || ''}`);
  expect(stored).not.toContain('credentialSubject');
});

test('credential template editor adds and removes enum options explicitly', async ({ page, request }) => {
  await authenticatedPage(page, request);
  await page.goto('/credentials');
  await page.getByLabel('模板名称', { exact: true }).fill(`枚举模板 ${Date.now()}`);
  await page.getByLabel('凭证类型', { exact: true }).fill('EnumOptionCredential');
  await page.getByLabel('字段键', { exact: true }).fill('degreeLevel');
  await page.getByLabel('中文名称', { exact: true }).fill('学历层次');
  await page.getByTestId('template-field-type').selectOption('enum');

  const optionInput = page.getByPlaceholder('例如 本科', { exact: true });
  await optionInput.fill('本科');
  await page.getByRole('button', { name: '新增选项', exact: true }).click();
  await optionInput.fill('硕士');
  await page.getByRole('button', { name: '新增选项', exact: true }).click();
  await expect(page.locator('.enum-option-chip').filter({ hasText: '本科' })).toBeVisible();
  await expect(page.locator('.enum-option-chip').filter({ hasText: '硕士' })).toBeVisible();

  await page.getByRole('button', { name: '删除选项 硕士', exact: true }).click();
  await expect(page.locator('.enum-option-chip').filter({ hasText: '硕士' })).toHaveCount(0);
  await optionInput.fill('硕士');
  await page.getByRole('button', { name: '新增选项', exact: true }).click();
  await page.getByRole('button', { name: '创建模板草稿', exact: true }).click();

  await expect(page.locator('.message').filter({ hasText: '模板草稿已创建' })).toBeVisible();
  await expect(page.getByText('学历层次', { exact: true })).toBeVisible();
});
