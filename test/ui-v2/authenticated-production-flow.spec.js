import { expect, test } from '@playwright/test';

test('authenticated V2 UI completes demo, VC verification and SD-JWT disclosure', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#session-status')).toContainText('V2');
  await expect(page.locator('#session-status')).toContainText('tenant_admin');

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#reset-demo').click();
  await expect(page.locator('#toast')).toContainText('演示数据已准备完成');
  await expect(page.locator('#stat-dids')).not.toHaveText('0');
  await expect(page.locator('#stat-vcs')).not.toHaveText('0');
  await page.locator('[data-view="issue"]').click();
  await expect(page.locator('#issue-credential-table')).toContainText('受保护的凭证主体');
  await expect(page.locator('#issue-credential-table')).not.toContainText('演示学员');

  await page.locator('[data-view="verify"]').click();
  await page.locator('#load-latest').click();
  await expect(page.locator('#toast')).toContainText('明文访问已审计');
  await page.locator('#verify-button').click();
  await expect(page.locator('#result-badge')).toHaveText('验证通过');

  await page.locator('[data-view="disclosure"]').click();
  await page.locator('#disclosure-format').selectOption('sd-jwt');
  await page.locator('.disclosure-fields input[value="credentialSubject.course"]').check();
  await page.locator('#generate-disclosure').click();
  await page.locator('#verify-disclosure').click();
  await expect(page.locator('#disclosure-result-badge')).toHaveText('验证通过');
});
