import { expect, test } from '@playwright/test';
import { resetDemo } from '../helpers/ui-fixtures.js';

test.beforeEach(async ({ page, request }) => { await resetDemo(request); await page.goto('/'); });
test('结构化日志组合筛选', async ({ page }) => { await page.locator('[data-view="logs"]').click(); await page.locator('#structured-log-type').selectOption('audit'); await page.locator('#structured-log-module').selectOption('VC'); await expect(page.locator('#structured-log-table tr')).not.toHaveCount(0); });
test('查看日志详情且敏感字段已脱敏', async ({ page }) => { await page.locator('[data-view="logs"]').click(); await page.locator('[data-log-detail]').first().click(); await expect(page.locator('#dialog-json')).not.toContainText('privateJwk'); await expect(page.locator('#dialog-json')).not.toContainText('proofValue'); });
test('清空日志取消确认', async ({ page }) => { await page.locator('[data-view="logs"]').click(); page.once('dialog', (d) => d.dismiss()); const before = await page.locator('#structured-log-table tr').count(); await page.locator('#clear-logs').click(); await expect(page.locator('#structured-log-table tr')).toHaveCount(before); });
test('确认清空日志并保留摘要', async ({ page }) => { await page.locator('[data-view="logs"]').click(); page.once('dialog', (d) => d.accept()); await page.locator('#clear-logs').click(); await expect(page.locator('#structured-log-table')).toContainText('LOG_CLEAR'); });
test('重置并载入演示数据', async ({ page }) => { page.once('dialog', (d) => d.accept()); await page.locator('#reset-demo').click(); await expect(page.locator('#stat-dids')).toHaveText('2'); await expect(page.locator('#stat-vcs')).toHaveText('1'); });
