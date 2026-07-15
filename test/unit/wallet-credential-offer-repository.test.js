import assert from 'node:assert/strict';
import test from 'node:test';
import { WalletCredentialOfferRepository } from '../../src/repositories/wallet-credential-offer-repository.js';

test('wallet inbox offers expose readable issuer, template and issuance date without decrypting VC content', async () => {
  const issuedAt = new Date('2026-07-15T08:30:00.000Z');
  const connection = { async execute(sql, values) {
    assert.match(sql, /INNER JOIN v2_organizations/);
    assert.match(sql, /LEFT JOIN v2_credential_templates/);
    assert.deepEqual(values, ['did:key:holder']);
    return [[{ id: 'offer-1', credential_id: 'urn:uuid:credential-1', status: 'pending',
      created_at: issuedAt, issued_at: issuedAt, issuer_name: '上海大学', template_name: '本科毕业证明' }]];
  } };
  const repository = new WalletCredentialOfferRepository({ envelopeCrypto: null });
  const items = await repository.listByHolder(connection, 'did:key:holder');
  assert.deepEqual(items, [{ id: 'offer-1', credentialId: 'urn:uuid:credential-1', status: 'pending',
    issuerName: '上海大学', templateName: '本科毕业证明', issuedAt: issuedAt.toISOString(), createdAt: issuedAt.toISOString() }]);
});
