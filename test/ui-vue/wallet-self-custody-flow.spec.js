import { expect, test } from '@playwright/test';

const apiBase = `http://127.0.0.1:${process.env.PLAYWRIGHT_VUE_API_PORT || '4177'}`;
const walletBase = `http://127.0.0.1:${process.env.PLAYWRIGHT_WALLET_PORT || '5176'}`;

async function call(request, session, path, data = undefined, method = 'post') {
  const response = await request[method](`${apiBase}${path}`, {
    headers: { authorization: `Bearer ${session.accessToken}` }, ...(data === undefined ? {} : { data }),
  });
  expect(response.ok(), `${path} returned ${response.status()}`).toBeTruthy();
  return response.json();
}

test('personal wallet imports a dynamic VC and creates a holder-bound combination', async ({ browser, page, request }) => {
  const sessionResponse = await request.post(`${apiBase}/api/v2/session/local`, { data: {} });
  const session = await sessionResponse.json();
  await page.addInitScript((value) => sessionStorage.setItem('did-vc-session-v2', JSON.stringify(value)), session);

  const wallet = await browser.newPage();
  await wallet.route('**/api/**', (route) => route.abort());
  await wallet.goto(walletBase);
  await wallet.locator('#create-identity').click();
  await expect(wallet.locator('#registration-output')).not.toHaveValue('');
  const registrationText = await wallet.locator('#registration-output').inputValue();
  const registration = JSON.parse(registrationText);
  expect(registration.document.verificationMethod[0].publicKeyJwk.d).toBeUndefined();
  expect(registrationText).not.toContain('privateKey');

  await call(request, session, '/api/v2/holder-dids/registration', registration);
  const issuer = await call(request, session, '/api/v2/dids', { name: 'UI dynamic issuer', role: 'issuer', method: 'example' });
  const degreeTemplateName = `大学毕业证明 ${Date.now()}`;
  const draft = await call(request, session, '/api/v2/credential-templates', { name: degreeTemplateName,
    credentialType: 'UiDegreeCredential', fields: [{ key: 'major', label: '专业', type: 'string', required: true }] });
  await call(request, session, `/api/v2/credential-templates/${draft.id}/publish`, {});
  const issued = await call(request, session, '/api/v2/credentials', { templateId: draft.id, issuerDid: issuer.did,
    holderDid: registration.did, claims: { major: '计算机科学' }, validUntil: new Date(Date.now() + 86_400_000).toISOString() });
  const delivery = await call(request, session, `/api/v2/credentials/${encodeURIComponent(issued.id)}/wallet-package`, {});
  expect(delivery.format).toBe('wallet-vc-package-v2');
  expect(delivery.display.issuerName).toBe(session.tenant.name);

  const skillTemplateName = `职业资格证明 ${Date.now()}`;
  const skillDraft = await call(request, session, '/api/v2/credential-templates', { name: skillTemplateName,
    credentialType: 'UiSkillCredential', fields: [{ key: 'certificate', label: '资格名称', type: 'string', required: true }] });
  await call(request, session, `/api/v2/credential-templates/${skillDraft.id}/publish`, {});
  const skillIssued = await call(request, session, '/api/v2/credentials', { templateId: skillDraft.id, issuerDid: issuer.did,
    holderDid: registration.did, claims: { certificate: '软件工程师' }, validUntil: new Date(Date.now() + 86_400_000).toISOString() });
  const skillDelivery = await call(request, session, `/api/v2/credentials/${encodeURIComponent(skillIssued.id)}/wallet-package`, {});

  await wallet.locator('[data-view-link="credentials"]').click();
  await wallet.locator('#package-input').fill(JSON.stringify(delivery));
  await wallet.locator('#import-package').click();
  await wallet.locator('#package-input').fill(JSON.stringify(skillDelivery));
  await wallet.locator('#import-package').click();
  await expect(wallet.locator('#wallet-credentials')).toContainText(issued.id);
  await expect(wallet.locator('#wallet-credentials')).toContainText(`${session.tenant.name}·${degreeTemplateName}`);
  await wallet.locator('[data-view-link="disclosure"]').click();
  await expect(wallet.locator('#credential-selections')).not.toContainText('专业');

  await wallet.locator('#credential-search').fill(degreeTemplateName);
  await expect(wallet.locator('#credential-picker')).toContainText(`${session.tenant.name}·${degreeTemplateName}`);
  await expect(wallet.locator('#credential-picker')).toContainText('专业：计算机科学');
  await wallet.locator('#credential-picker').selectOption(issued.id);
  await wallet.locator('#add-credential').click();
  await wallet.locator('#credential-search').fill('软件工程师');
  await expect(wallet.locator('#credential-picker')).toContainText(skillTemplateName);
  await wallet.locator('#credential-search').fill(skillTemplateName);
  await wallet.locator('#credential-picker').selectOption(skillIssued.id);
  await wallet.locator('#add-credential').click();
  await expect(wallet.locator('#credential-selections [data-credential]')).toHaveCount(2);
  await expect(wallet.locator('#credential-selections')).toContainText('专业');
  await expect(wallet.locator('#credential-selections')).toContainText('资格名称');
  for (const checkbox of await wallet.locator('#credential-selections input[type="checkbox"]').all()) await checkbox.check();

  const challenge = await call(request, session, '/api/v2/wallet-challenges', { domain: 'hr.example.com' });
  await wallet.locator('#challenge').fill(challenge.challenge);
  await wallet.locator('#domain').fill(challenge.domain);
  await wallet.locator('#create-presentation').click();
  const presentationText = await wallet.locator('#presentation-output').inputValue();
  expect(presentationText).not.toContain('privateKey');
  expect(presentationText).toContain('WalletBoundMultiSdJwtPresentation2026');

  await page.goto('/wallet-verify');
  await page.locator('textarea').last().fill(presentationText);
  await page.getByRole('button', { name: '逐张验证并核验 Holder 组合签名' }).click();
  await expect(page.locator('.message')).toContainText('组合出示验证通过');
  await expect(page.getByText('逐张凭证验证结果')).toBeVisible();
  await expect(page.getByText('组合验证台账')).toBeVisible();
  await wallet.close();
});
