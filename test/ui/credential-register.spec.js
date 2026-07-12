import { expect, test } from '@playwright/test';
import { resetDemo } from '../helpers/ui-fixtures.js';

test.beforeEach(async ({ page, request }) => { await resetDemo(request); await page.goto('/'); });

test('签发页凭证台账展示全部历史 VC', async ({ page }) => { await page.locator('[data-view="issue"]').click(); await expect(page.locator('#issue-credential-table')).toContainText('active'); });
test('查看任意历史 VC 完整 JSON', async ({ page }) => { await page.locator('#credential-table [data-open-vc]').click(); await expect(page.locator('#dialog-json')).toContainText('VerifiableCredential'); });
test('总览与签发页台账状态同步', async ({ page }) => { await page.locator('#credential-table [data-vc-action="suspend"]').click(); await page.locator('[data-view="issue"]').click(); await expect(page.locator('#issue-credential-table')).toContainText('suspended'); });
test('凭证台账搜索与清除', async ({ page }) => { await page.locator('#vc-search').fill('张晓明'); await page.locator('#vc-search-submit').click(); await expect(page.locator('#credential-table')).toContainText('张晓明'); await page.locator('#vc-search-clear').click(); await expect(page.locator('#credential-table tr')).toHaveCount(1); });
test('暂停 active VC', async ({ page }) => { await page.locator('#credential-table [data-vc-action="suspend"]').click(); await expect(page.locator('#credential-table')).toContainText('suspended'); });
test('恢复 suspended VC', async ({ page }) => { await page.locator('#credential-table [data-vc-action="suspend"]').click(); await page.locator('#credential-table [data-vc-action="resume"]').click(); await expect(page.locator('#credential-table')).toContainText('active'); });
test('撤销 active VC', async ({ page }) => { page.on('dialog', (d) => d.accept()); await page.locator('#credential-table [data-revoke]').click(); await expect(page.locator('#credential-table')).toContainText('revoked'); });
