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
