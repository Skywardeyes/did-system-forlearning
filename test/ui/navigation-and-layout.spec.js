import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page, request }) => {
  await request.post('/api/demo/reset');
  await page.goto('/');
  await expect(page.locator('#stat-dids')).toHaveText('2');
});

test('all six views navigate and expose their primary controls', async ({ page }) => {
  const views = [
    ['overview', '#view-overview'], ['identities', '#did-form'], ['issue', '#issue-form'], ['verify', '#verify-input'], ['disclosure', '#disclosure-input'], ['logs', '#structured-log-table'],
  ];
  await expect(page.locator('.nav-item')).toHaveCount(6);
  for (const [view, target] of views) {
    await page.locator(`[data-view="${view}"]`).click();
    await expect(page.locator(target)).toBeVisible();
  }
  await page.locator('[data-view="overview"]').click();
  const spacing = await page.locator('.list-tools').first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight) };
  });
  expect(spacing).toEqual({ left: 20, right: 20 });
});

test('mobile viewport has no horizontal page overflow and navigation stays usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  for (const button of await page.locator('.nav-item').all()) await expect(button).toBeVisible();
  const navPadding = await page.locator('.nav-item').first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { vertical: parseFloat(style.paddingTop), horizontal: parseFloat(style.paddingLeft) };
  });
  expect(navPadding.vertical).toBeGreaterThanOrEqual(6);
  expect(navPadding.horizontal).toBeGreaterThanOrEqual(4);
  await page.locator('[data-view="logs"]').click();
  await expect(page.locator('#view-logs')).toBeVisible();
});

test('list search submits explicitly, clears in one click and changes page size', async ({ page }) => {
  await page.locator('[data-view="identities"]').click();
  const input = page.locator('#did-search');
  await input.fill('不存在的身份');
  await expect(page.locator('#did-list')).not.toContainText('尚未创建 DID');
  await expect(page.locator('#did-search-clear')).toBeVisible();
  await page.locator('#did-search-submit').click();
  await expect(page.locator('#did-list')).toContainText('尚未创建 DID');
  await page.locator('#did-search-clear').click();
  await expect(input).toHaveValue('');
  await expect(page.locator('#did-search-clear')).toBeHidden();
  await expect(page.locator('#did-list')).not.toContainText('尚未创建 DID');
  await page.locator('#did-page-size').selectOption('20');
  await expect(page.locator('#did-page-size')).toHaveValue('20');
  await expect(page.locator('#did-pagination .page-summary')).toContainText('1/1 页');
});

test('structured logs use the same labeled search controls', async ({ page }) => {
  await page.locator('[data-view="logs"]').click();
  await expect(page.locator('label[for="structured-log-search"]')).toHaveText('搜索');
  await expect(page.locator('#structured-log-search')).toHaveAttribute('placeholder', '支持模糊搜索');
  await expect(page.locator('#structured-log-page-size')).toBeVisible();
});
