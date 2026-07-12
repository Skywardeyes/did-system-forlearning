import { expect, test } from '@playwright/test';
import { resetDemo } from '../helpers/ui-fixtures.js';

test.beforeEach(async ({ page, request }) => { await resetDemo(request); await page.goto('/'); await page.locator('[data-view="verify"]').click(); await page.locator('#load-latest').click(); });
test('载入最新 VC 并完成七项验证', async ({ page }) => { await page.locator('#verify-button').click(); await expect(page.locator('#verify-results .check-item')).toHaveCount(7); await expect(page.locator('#result-badge')).toContainText('验证通过'); });
test('篡改学员姓名后验证失败', async ({ page }) => { await page.locator('#tamper-name').click(); await page.locator('#verify-button').click(); await expect(page.locator('#result-badge')).toContainText('验证失败'); });
test('无效 JSON 显示格式错误', async ({ page }) => { await page.locator('#verify-input').fill('{bad'); await page.locator('#verify-button').click(); await expect(page.locator('#toast')).toContainText('JSON'); });
test('验证记录台账显示成功备注', async ({ page }) => { await page.locator('#verify-button').click(); await expect(page.locator('#verification-log-table tr').first()).toContainText('全部检查通过'); });
test('验证记录台账显示单项失败原因', async ({ page }) => { await page.locator('#tamper-name').click(); await page.locator('#verify-button').click(); await expect(page.locator('#verification-log-table tr').first()).toContainText('签名无效'); });
test('验证记录搜索、清除与分页', async ({ page }) => { await page.locator('#verify-button').click(); await page.locator('#verify-log-search').fill('true'); await page.locator('#verify-log-search-submit').click(); await expect(page.locator('#verification-log-table')).toContainText('验证通过'); await page.locator('#verify-log-search-clear').click(); });
