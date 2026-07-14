// Public-only fixture representing a wallet identity created outside this service.
// It deliberately contains no private JWK, seed phrase, or recovery material.
export const localDemoWalletIdentity = Object.freeze({
  did: 'did:key:z6MkjMpfbBUY9baDtz6A2PPD2wZugFho9aQY4MDcUMziNF39',
  document: Object.freeze({
    '@context': Object.freeze(['https://www.w3.org/ns/did/v1']),
    id: 'did:key:z6MkjMpfbBUY9baDtz6A2PPD2wZugFho9aQY4MDcUMziNF39',
    verificationMethod: Object.freeze([Object.freeze({
      id: 'did:key:z6MkjMpfbBUY9baDtz6A2PPD2wZugFho9aQY4MDcUMziNF39#z6MkjMpfbBUY9baDtz6A2PPD2wZugFho9aQY4MDcUMziNF39',
      type: 'JsonWebKey2020',
      controller: 'did:key:z6MkjMpfbBUY9baDtz6A2PPD2wZugFho9aQY4MDcUMziNF39',
      publicKeyJwk: Object.freeze({ kty: 'OKP', crv: 'Ed25519', x: 'SOXVhrbHft6dGtJcdsV8ZcOigbw96u5h0rgq4mXjcWw' }),
    })]),
    authentication: Object.freeze(['did:key:z6MkjMpfbBUY9baDtz6A2PPD2wZugFho9aQY4MDcUMziNF39#z6MkjMpfbBUY9baDtz6A2PPD2wZugFho9aQY4MDcUMziNF39']),
    assertionMethod: Object.freeze(['did:key:z6MkjMpfbBUY9baDtz6A2PPD2wZugFho9aQY4MDcUMziNF39#z6MkjMpfbBUY9baDtz6A2PPD2wZugFho9aQY4MDcUMziNF39']),
  }),
});
