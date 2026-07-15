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
  const unique = Date.now();
  const organizationPassword = `Organization-${unique}-A1`;
  const walletPassword = `Wallet-${unique}-A1`;
  const sessionResponse = await request.post(`${apiBase}/api/v2/auth/register`, { data: {
    displayName: '演示组织负责人', email: `organization-${unique}@example.test`, password: organizationPassword,
    organization: { name: `演示大学 ${unique}`, organizationType: 'education' },
  } });
  expect(sessionResponse.ok()).toBeTruthy();
  const session = await sessionResponse.json();
  const otherSessionResponse = await request.post(`${apiBase}/api/v2/auth/register`, { data: {
    displayName: '其他验证方', email: `other-verifier-${unique}@example.test`, password: `Other-${unique}-A1`,
    organization: { name: `其他验证机构 ${unique}`, organizationType: 'certification' },
  } });
  expect(otherSessionResponse.ok()).toBeTruthy();
  const otherSession = await otherSessionResponse.json();
  await page.addInitScript((value) => sessionStorage.setItem('did-vc-session-v2', JSON.stringify(value)), session);

  const wallet = await browser.newPage();
  await wallet.addInitScript((value) => { globalThis.WALLET_API_BASE = value; }, apiBase);
  await wallet.goto(walletBase);
  await wallet.locator('#auth-register-tab').click();
  await wallet.locator('#auth-name').fill('张同学');
  await wallet.locator('#auth-email').fill(`wallet-${Date.now()}@example.test`);
  await wallet.locator('#auth-password').fill(walletPassword);
  await wallet.locator('#auth-submit').click();
  await expect(wallet.locator('#wallet-shell')).toBeVisible();

  await wallet.locator('#identity-name').fill('学习身份');
  await wallet.locator('#create-identity').click();
  await wallet.locator('#identity-name').fill('职业身份');
  await wallet.locator('#create-identity').click();
  await expect(wallet.locator('#identity-list tbody tr')).toHaveCount(2);
  await expect(wallet.locator('#identity-list')).toContainText('学习身份');
  await expect(wallet.locator('#identity-list')).toContainText('职业身份');
  await expect(wallet.locator('#registration-output')).toHaveCount(0);

  const learningIdentityId = await wallet.locator('#request-identity-picker option').filter({ hasText: '学习身份' }).getAttribute('value');
  await wallet.locator('#request-identity-picker').selectOption(learningIdentityId);
  await wallet.locator('#organization-picker').selectOption(session.tenant.id);
  await wallet.locator('#organization-request-message').fill('申请签发学习凭证');
  await wallet.locator('#send-organization-request').click();
  await expect(wallet.locator('#organization-request-status')).toContainText('已将“学习身份”发送给组织');
  const requests = await call(request, session, '/api/v2/holder-requests', undefined, 'get');
  const holderRequest = requests.items.find((item) => item.holderDisplayName === '学习身份');
  expect(holderRequest).toBeTruthy();
  await call(request, session, `/api/v2/holder-requests/${holderRequest.id}/accept`, {});
  const registration = { did: holderRequest.holderDid };
  await wallet.locator('#identity-list tbody tr').filter({ hasText: '学习身份' }).getByRole('button', { name: '切换到此 DID' }).click();
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
  await wallet.getByText('高级工具：手动导入交付包').click();
  await wallet.locator('#package-input').fill(JSON.stringify(delivery));
  await wallet.locator('#import-package').click();
  await expect(wallet.locator('#package-message')).toContainText('VC 已导入本地钱包');
  await expect(wallet.locator('#package-input')).toHaveValue('');
  await wallet.locator('#package-input').fill(JSON.stringify(skillDelivery));
  await wallet.locator('#import-package').click();
  await expect(wallet.locator('#package-message')).toContainText('VC 已导入本地钱包');
  await expect(wallet.locator('#package-input')).toHaveValue('');
  await expect(wallet.locator('#wallet-credentials')).toContainText(issued.id);
  await expect(wallet.locator('#wallet-credentials')).toContainText(`${session.tenant.name}·${degreeTemplateName}`);
  await wallet.locator('[data-view-link="disclosure"]').click();
  await wallet.locator('#verifier-organization-picker').selectOption(session.tenant.id);
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

  await wallet.locator('#create-presentation').click();
  await expect(wallet.locator('#presentation-message')).toContainText('组合披露证明已在本地生成');
  const presentationText = await wallet.locator('#presentation-output').inputValue();
  expect(presentationText).not.toContain('privateKey');
  expect(presentationText).toContain('WalletBoundMultiSdJwtPresentation2026');
  await wallet.locator('#nfc-touch').click({ force: true });
  await expect(wallet.locator('#nfc-message')).toContainText(`证明已发送给“${session.tenant.name}”`);
  expect(await call(request, otherSession, '/api/v2/nfc/presentations/latest', undefined, 'get')).toBeNull();

  await page.goto('/wallet-verify');
  await expect(page.getByText('已收到一份选择性披露证明')).toBeVisible();
  await page.getByRole('button', { name: '验证', exact: true }).click();
  await expect(page.locator('.message')).toContainText('验证通过');
  await expect(page.getByText('逐张凭证结果')).toBeVisible();
  await expect(page.getByText('组合验证台账')).toBeVisible();
  await wallet.close();
});
