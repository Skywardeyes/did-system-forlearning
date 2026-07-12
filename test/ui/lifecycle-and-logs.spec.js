import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page, request }) => {
  await request.post('/api/demo/reset');
  await page.goto('/');
  await expect(page.locator('#stat-vcs')).toHaveText('1');
});

test('credential suspension, recovery and revocation are available in the ledger', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('#credential-table [data-vc-action="suspend"]').click();
  await expect(page.locator('#credential-table')).toContainText('suspended');
  await page.locator('#credential-table [data-vc-action="resume"]').click();
  await expect(page.locator('#credential-table')).toContainText('active');
  await page.locator('#credential-table [data-revoke]').click();
  await expect(page.locator('#credential-table')).toContainText('revoked');
});

test('issue page reuses the credential ledger and lifecycle actions', async ({ page }) => {
  await page.locator('[data-view="issue"]').click();
  await expect(page.locator('#issue-credential-table')).toContainText('active');
  await page.locator('#issue-credential-table [data-vc-action="suspend"]').click();
  await expect(page.locator('#issue-credential-table')).toContainText('suspended');
  await expect(page.locator('#credential-table')).toContainText('suspended');
});

test('verification ledger shows success and readable failure reasons', async ({ page }) => {
  await page.locator('[data-view="verify"]').click();
  await page.locator('#load-latest').click();
  await page.locator('#verify-button').click();
  await expect(page.locator('#verification-log-table tr').first()).toContainText('全部检查通过');
  await page.locator('#tamper-name').click();
  await page.locator('#verify-button').click();
  await expect(page.locator('#verification-log-table tr').first()).toContainText('验证失败');
  await expect(page.locator('#verification-log-table tr').first()).toContainText('签名无效');
});

test('log filters, details and confirmed clear remain usable and secret-free', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('[data-view="logs"]').click();
  await page.locator('#structured-log-type').selectOption('audit');
  await expect(page.locator('#structured-log-table tr')).not.toHaveCount(0);
  await page.locator('[data-log-detail]').first().click();
  await expect(page.locator('#json-dialog')).toBeVisible();
  await expect(page.locator('#dialog-json')).not.toContainText('privateJwk');
  await expect(page.locator('#dialog-json')).not.toContainText('proofValue');
  await page.locator('#dialog-close').click();
  await page.locator('#clear-logs').click();
  await expect(page.locator('#structured-log-table')).toContainText('LOG_CLEAR');
});
