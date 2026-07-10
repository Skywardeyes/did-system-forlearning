import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page, request }) => {
  await request.post('/api/demo/reset');
  await page.goto('/');
  await expect(page.locator('#stat-vcs')).toHaveText('1');
});

test('credential suspension, recovery and revocation are available in the ledger', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('[data-vc-action="suspend"]').click();
  await expect(page.locator('#credential-table')).toContainText('suspended');
  await page.locator('[data-vc-action="resume"]').click();
  await expect(page.locator('#credential-table')).toContainText('active');
  await page.locator('[data-revoke]').click();
  await expect(page.locator('#credential-table')).toContainText('revoked');
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
