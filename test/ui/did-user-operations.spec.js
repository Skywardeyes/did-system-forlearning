import { expect, test } from '@playwright/test';
import { resetDemo, seedDids } from '../helpers/ui-fixtures.js';

test.beforeEach(async ({ page, request }) => { await resetDemo(request); await page.goto('/'); await page.locator('[data-view="identities"]').click(); });

test('创建 Issuer DID', async ({ page }) => {
  await page.locator('#did-form input[name="name"]').fill('新增机构'); await page.locator('#did-form button[type="submit"]').click(); await expect(page.locator('#did-list')).toContainText('新增机构');
});

test('创建 Holder DID', async ({ page }) => {
  await page.locator('#did-form input[name="name"]').fill('新增学员'); await page.locator('input[name="role"][value="holder"]').check({ force: true }); await page.locator('#did-form button[type="submit"]').click(); await expect(page.locator('#did-list')).toContainText('新增学员');
});

test('查看 DID Document 且不泄露私钥', async ({ page }) => {
  await page.locator('[data-document]').first().click(); await expect(page.locator('#json-dialog')).toBeVisible(); await expect(page.locator('#dialog-json')).not.toContainText('privateJwk');
});

test('did:key 不显示更新、轮换和停用操作', async ({ page }) => {
  const keyCard = page.locator('.identity-card').filter({ hasText: 'did:key' }); await expect(keyCard.locator('[data-update-did], [data-rotate-did], [data-deactivate-did]')).toHaveCount(0);
});

test('DID 列表搜索与清除', async ({ page }) => {
  await page.locator('#did-search').fill('张晓明'); await page.locator('#did-search-submit').click(); await expect(page.locator('#did-list')).toContainText('张晓明'); await page.locator('#did-search-clear').click(); await expect(page.locator('.identity-card')).toHaveCount(2);
});

test('DID 列表分页和页大小切换', async ({ page, request }) => {
  await seedDids(request, 11); await page.reload(); await page.locator('[data-view="identities"]').click(); await expect(page.locator('#did-pagination')).toContainText('2 页'); await page.locator('#did-page-size').selectOption('20'); await expect(page.locator('.identity-card')).toHaveCount(13);
});
