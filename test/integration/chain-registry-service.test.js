import assert from 'node:assert/strict';
import test from 'node:test';
import ganache from 'ganache';
import { ContractFactory, JsonRpcProvider } from 'ethers';
import { compileDidRegistry } from '../../blockchain/compile.js';
import { ChainRegistryService } from '../../src/services/chain-registry-service.js';

test('local EVM DidRegistry anchors an Issuer DID document hash and irreversible deactivation', async () => {
  const node = ganache.server({ wallet: { deterministic: true }, chain: { chainId: 31337 }, logging: { quiet: true } });
  await node.listen(0, '127.0.0.1');
  try {
    const port = node.address().port;
    const provider = new JsonRpcProvider(`http://127.0.0.1:${port}`);
    const signer = await provider.getSigner(0);
    const { abi, bytecode } = await compileDidRegistry();
    const contract = await new ContractFactory(abi, bytecode, signer).deploy();
    await contract.waitForDeployment();
    const service = new ChainRegistryService({ blockchain: {
      enabled: true, rpcUrl: `http://127.0.0.1:${port}`, chainId: 31337, contractAddress: await contract.getAddress(),
    } });
    const did = { id: 'issuer-1', did: 'did:example:issuer-1', role: 'issuer', status: 'active', document: {
      id: 'did:example:issuer-1', verificationMethod: [{ id: 'did:example:issuer-1#key-1', publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: 'public-key' } }],
    } };
    const registered = await service.syncIssuerDid(did);
    assert.equal(registered.action, 'registered');
    assert.equal(registered.registered, true);
    assert.equal(registered.deactivated, false);
    assert.equal(registered.version, 1);
    assert.match(registered.transactionHash, /^0x[0-9a-f]{64}$/i);
    const updated = await service.syncIssuerDid({ ...did, document: { ...did.document, service: [{ id: '#service', serviceEndpoint: 'https://issuer.example.test' }] } });
    assert.equal(updated.action, 'updated');
    assert.equal(updated.version, 2);
    assert.notEqual(updated.documentHash, registered.documentHash);
    const stopped = await service.deactivateIssuerDid({ ...did, status: 'deactivated' });
    assert.equal(stopped.deactivated, true);
    assert.equal(stopped.version, 3);
    await assert.rejects(() => service.syncIssuerDid(did), /停用/);
  } finally { await node.close(); }
});
