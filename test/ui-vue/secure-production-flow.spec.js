import { expect, test } from '@playwright/test';

const apiBase = `http://127.0.0.1:${process.env.PLAYWRIGHT_VUE_API_PORT || '4177'}`;

test.beforeEach(async ({ request }) => {
  const sessionResponse = await request.post(`${apiBase}/api/v2/session/local`, { data: {} });
  expect(sessionResponse.ok()).toBeTruthy();
  const session = await sessionResponse.json();
  const reset = await request.post(`${apiBase}/api/v2/demo/reset`, {
    headers: { authorization: `Bearer ${session.accessToken}` }, data: {},
  });
  expect(reset.ok()).toBeTruthy();
});

test('Vue V2 UI protects lists, verifies VC, creates SD-JWT and records sensitive access', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('V2 已认证')).toBeVisible();
  await expect(page.locator('.stats-grid article').nth(0).locator('strong')).not.toHaveText('0');

  await page.getByRole('link', { name: /凭证签发/ }).click();
  await expect(page.getByText('受保护的 VC 正文').first()).toBeVisible();
  await expect(page.locator('table')).not.toContainText('演示学员');

  await page.getByRole('link', { name: /凭证验证/ }).click();
  await page.getByRole('button', { name: '授权载入' }).click();
  await expect(page.getByText('已授权载入，明文访问已审计')).toBeVisible();
  await page.getByRole('button', { name: '执行完整验证' }).click();
  await expect(page.getByText('验证通过', { exact: true }).first()).toBeVisible();

  await page.getByRole('link', { name: /选择性披露/ }).click();
  const credentialSelect = page.locator('select').first();
  await credentialSelect.selectOption({ index: 1 });
  await page.getByRole('button', { name: '生成最小披露证明' }).click();
  await expect(page.getByText('披露证明已生成，未选字段不会返回到前端')).toBeVisible();
  await page.getByRole('button', { name: '执行验证' }).click();
  await expect(page.getByText('披露验证通过')).toBeVisible();

  await page.getByRole('link', { name: /审计中心/ }).click();
  await expect(page.locator('table')).toContainText('verification_preparation');
});

test('decrypted VC is cleared when leaving the verification route', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.stats-grid article').nth(1).locator('strong')).not.toHaveText('0');
  await page.getByRole('link', { name: /凭证验证/ }).click();
  await page.getByRole('button', { name: '授权载入' }).click();
  await expect(page.locator('textarea')).toHaveValue(/credentialSubject/);
  await page.getByRole('link', { name: /运行总览/ }).click();
  await page.getByRole('link', { name: /凭证验证/ }).click();
  await expect(page.locator('textarea')).toHaveValue('');
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});
