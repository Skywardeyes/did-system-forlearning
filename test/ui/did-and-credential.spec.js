import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page, request }) => {
  await request.post('/api/demo/reset');
  await page.goto('/');
  await expect(page.locator('#stat-dids')).toHaveText('2');
});

test('user creates a DID and opens its public DID document', async ({ page }) => {
  await page.locator('[data-view="identities"]').click();
  await page.locator('#did-form [name="name"]').fill('Browser Holder');
  await page.locator('#did-form [name="method"]').selectOption('key');
  await page.locator('#did-form [name="role"][value="holder"]').check();
  await page.locator('#did-form button[type="submit"]').click();
  await expect(page.locator('#toast')).toContainText('DID');
  await expect(page.locator('#did-list')).toContainText('Browser Holder');
  const card = page.locator('.identity-card').filter({ hasText: 'Browser Holder' });
  await card.locator('[data-document]').click();
  await expect(page.locator('#json-dialog')).toBeVisible();
  await expect(page.locator('#dialog-json')).toContainText('did:key:');
  await expect(page.locator('#dialog-json')).not.toContainText('privateJwk');
});

test('user issues, verifies and tampers with a credential', async ({ page }) => {
  await page.locator('[data-view="issue"]').click();
  await page.locator('#issue-form [name="studentName"]').fill('Browser Student');
  await page.locator('#issue-form [name="courseName"]').fill('Browser Course');
  await page.locator('#issue-form button[type="submit"]').click();
  await expect(page.locator('#vc-preview')).toContainText('Browser Course');
  await page.locator('[data-view="verify"]').click();
  await page.locator('#load-latest').click();
  await page.locator('#verify-button').click();
  await expect(page.locator('#result-badge')).toHaveText('验证通过');
  await expect(page.locator('.check-item')).toHaveCount(7);
  await expect(page.locator('.check-item.failed')).toHaveCount(0);
  await page.locator('#tamper-name').click();
  await page.locator('#verify-button').click();
  await expect(page.locator('#result-badge')).toHaveText('验证失败');
  await expect(page.locator('.check-item.failed')).not.toHaveCount(0);
  await page.reload();
  await expect(page.locator('#stat-vcs')).toHaveText('2');
});
