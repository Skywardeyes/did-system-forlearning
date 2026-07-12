import { expect, test } from '@playwright/test';
import { resetDemo } from '../helpers/ui-fixtures.js';

test('运行总览显示 DID、VC、有效凭证和验证次数统计', async ({ page, request }) => {
  await resetDemo(request); await page.goto('/');
  await expect(page.locator('#stat-dids')).toHaveText('2'); await expect(page.locator('#stat-vcs')).toHaveText('1'); await expect(page.locator('#stat-active')).toHaveText('1');
});

test('运行总览显示最近四条验证活动', async ({ page, request }) => {
  const demo = await resetDemo(request); for (let i = 0; i < 5; i += 1) await request.post('/api/verify', { data: { credential: demo.credential.credential } });
  await page.goto('/'); await expect(page.locator('#recent-logs .activity-item')).toHaveCount(4);
});

test('无验证记录时显示验证空状态', async ({ page, request }) => {
  await request.post('/api/demo/reset'); await page.goto('/'); await page.locator('[data-view="verify"]').click();
  await expect(page.locator('#verification-log-table')).toContainText('暂无验证记录');
});

test('API 请求失败时保留当前列表并提示错误', async ({ page, request }) => {
  await resetDemo(request); await page.goto('/');
  await page.route('**/api/credentials/*/suspend', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"模拟服务失败"}' }));
  await page.locator('#credential-table [data-vc-action="suspend"]').click();
  await expect(page.locator('#toast')).toContainText('模拟服务失败'); await expect(page.locator('#credential-table')).toContainText('active');
});
