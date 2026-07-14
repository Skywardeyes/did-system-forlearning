import { expect, test } from '@playwright/test';

const apiBase = `http://127.0.0.1:${process.env.PLAYWRIGHT_VUE_API_PORT || '4177'}`;
const walletBase = `http://127.0.0.1:${process.env.PLAYWRIGHT_WALLET_PORT || '5176'}`;

test.beforeEach(async ({ request }) => {
  const sessionResponse = await request.post(`${apiBase}/api/v2/session/local`, { data: {} });
  const session = await sessionResponse.json();
  await request.post(`${apiBase}/api/v2/demo/reset`, { headers: { authorization: `Bearer ${session.accessToken}` }, data: {} });
});

test('personal wallet keeps Holder key local through registration, issuance, delivery and verification', async ({ browser, page, request }) => {
  const wallet = await browser.newPage();
  await wallet.route('**/api/**', (route) => route.abort());
  await wallet.goto(walletBase);
  await wallet.locator('button').first().click();
  await expect(wallet.locator('#registration-output')).not.toHaveValue('');
  const registrationText = await wallet.locator('#registration-output').inputValue();
  const registration = JSON.parse(registrationText);
  expect(registration.document.verificationMethod[0].publicKeyJwk.d).toBeUndefined();
  expect(registrationText).not.toContain('privateKey');

  await page.goto('/dids');
  await page.locator('textarea').fill(registrationText);
  await page.locator('button.primary').nth(1).click();
  await expect(page.locator('.message')).toContainText(/.+/);

  await page.locator('a[href="/credentials"]').click();
  const selects = page.locator('select');
  await selects.nth(0).selectOption({ index: 1 });
  await selects.nth(1).selectOption(registration.did);
  const inputs = page.locator('input');
  await inputs.nth(0).fill('wallet learner');
  await inputs.nth(1).fill('self-custody DID practice');
  await page.locator('button.primary').click();

  const dialog = page.locator('dialog');
  await expect(dialog).toHaveAttribute('open', '');
  const issuedText = await dialog.locator('pre').textContent();
  expect(issuedText).not.toBeNull();
  const issued = JSON.parse(issuedText || '{}');
  await dialog.locator('button.icon-button').click();

  const row = page.locator('tr').filter({ hasText: issued.id.slice(0, 18) });
  await row.locator('button').nth(1).click();
  await expect(dialog).toHaveAttribute('open', '');
  const delivery = await dialog.locator('pre').textContent();
  expect(delivery).not.toBeNull();
  await dialog.locator('button.icon-button').click();

  await wallet.locator('[data-view-link="credentials"]').click();
  await wallet.locator('#package-input').fill(delivery || '');
  await wallet.locator('#import-package').click();
  await expect(wallet.locator('#credential-select')).toHaveValue(issued.id);
  await wallet.locator('[data-view-link="disclosure"]').click();
  await wallet.locator('#challenge').fill('verifier-challenge-wallet-001');
  await wallet.locator('#domain').fill('hr.example.com');
  await wallet.locator('#create-presentation').click();
  const presentation = await wallet.locator('#presentation-output').inputValue();
  expect(presentation).not.toContain('privateKey');
  expect(presentation).toContain('holderProof');

  const sessionResponse = await request.post(`${apiBase}/api/v2/session/local`, { data: {} });
  const session = await sessionResponse.json();
  const challengeResponse = await request.post(`${apiBase}/api/v2/wallet-challenges`, {
    headers: { authorization: `Bearer ${session.accessToken}` }, data: { domain: 'hr.example.com' },
  });
  const issuedChallenge = await challengeResponse.json();
  await wallet.locator('#challenge').fill(issuedChallenge.challenge);
  await wallet.locator('#create-presentation').click();
  const boundPresentation = await wallet.locator('#presentation-output').inputValue();

  await page.locator('a[href="/wallet-verify"]').click();
  await page.locator('textarea').last().fill(boundPresentation);
  await page.locator('button.primary').click();
  await expect(page.locator('.message')).toContainText(/.+/);
  await wallet.close();
});
