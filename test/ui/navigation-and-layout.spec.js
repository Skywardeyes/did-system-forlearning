import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page, request }) => {
  await request.post('/api/demo/reset');
  await page.goto('/');
  await expect(page.locator('#stat-dids')).toHaveText('2');
});

test('all five views navigate and expose their primary controls', async ({ page }) => {
  const views = [
    ['overview', '#view-overview'], ['identities', '#did-form'], ['issue', '#issue-form'], ['verify', '#verify-input'], ['logs', '#structured-log-table'],
  ];
  await expect(page.locator('.nav-item')).toHaveCount(5);
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
