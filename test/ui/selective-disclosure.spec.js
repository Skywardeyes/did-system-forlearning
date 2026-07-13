import { expect, test } from '@playwright/test';
import { openView, resetDemo } from '../helpers/ui-fixtures.js';

test('holder discloses selected claims, verifies them and detects tampering', async ({ page, request }) => {
  await resetDemo(request);
  await openView(page, 'disclosure');

  await expect(page.getByRole('heading', { name: '教学版选择性披露' })).toBeVisible();
  await expect(page.locator('#disclosure-credential')).not.toHaveValue('');
  await page.locator('input[value="credentialSubject.name"]').uncheck();
  await page.locator('input[value="credentialSubject.course"]').check();
  await page.locator('input[value="credentialSubject.completionDate"]').check();
  await page.getByRole('button', { name: '生成披露证明' }).click();

  await expect(page.locator('#disclosure-input')).toHaveValue(/数字身份与可信凭证训练营/);
  const presentationText = await page.locator('#disclosure-input').inputValue();
  expect(presentationText).toContain('数字身份与可信凭证训练营');
  expect(presentationText).not.toContain('张晓明');
  await expect(page.locator('#disclosure-privacy-summary')).toContainText('未公开：学员姓名');

  await page.getByRole('button', { name: '验证披露证明' }).click();
  await expect(page.locator('#disclosure-result-badge')).toHaveText('验证通过');
  await expect(page.locator('#disclosure-results')).toContainText('摘要清单签名');
  await expect(page.locator('#disclosure-results')).toContainText('2 个披露字段摘要一致');
  await expect(page.locator('#disclosure-verification-log-table')).toContainText('验证通过');
  await expect(page.locator('#disclosure-verification-log-table')).toContainText('课程、完成日期');

  await page.getByRole('button', { name: '模拟篡改课程' }).click();
  await page.getByRole('button', { name: '验证披露证明' }).click();
  await expect(page.locator('#disclosure-result-badge')).toHaveText('验证失败');
  await expect(page.locator('#disclosure-results')).toContainText('披露字段被修改');
  await expect(page.locator('#disclosure-verification-log-table')).toContainText('公开字段摘要不一致');

  await page.locator('#disclosure-log-search').fill('disclosedClaims');
  await page.locator('#disclosure-log-search-submit').click();
  await expect(page.locator('#disclosure-verification-log-table tr')).toHaveCount(1);
  await page.locator('#disclosure-log-search-clear').click();
  await expect(page.locator('#disclosure-verification-log-table tr')).toHaveCount(2);
});
