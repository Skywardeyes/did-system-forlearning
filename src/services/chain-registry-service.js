import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Contract, JsonRpcProvider, keccak256, toUtf8Bytes } from 'ethers';
import { stableStringify } from '../crypto.js';
import { DID_REGISTRY_ABI } from '../../blockchain/registry-abi.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const deploymentPath = path.join(root, 'data', 'chain-deployment.json');

const toNumber = (value) => Number(value || 0n);

export class ChainRegistryService {
  constructor({ blockchain }) { this.blockchain = blockchain; }

  didHash(did) { return keccak256(toUtf8Bytes(String(did))); }
  documentHash(document) { return keccak256(toUtf8Bytes(stableStringify(document))); }

  async settings() {
    if (!this.blockchain.enabled) return { enabled: false, reason: '区块链锚定尚未启用' };
    let contractAddress = this.blockchain.contractAddress;
    if (!contractAddress) {
      try { contractAddress = JSON.parse(await readFile(deploymentPath, 'utf8')).contractAddress; } catch { /* deployment is optional until local chain is initialized */ }
    }
    if (!contractAddress) return { enabled: true, ready: false, reason: '尚未部署 DidRegistry 合约' };
    return { enabled: true, ready: true, rpcUrl: this.blockchain.rpcUrl, chainId: this.blockchain.chainId, contractAddress };
  }

  async connection({ write = false } = {}) {
    const settings = await this.settings();
    if (!settings.enabled || !settings.ready) { const error = new Error(settings.reason); error.code = 'CHAIN_NOT_READY'; throw error; }
    const provider = new JsonRpcProvider(settings.rpcUrl);
    const runner = write ? await provider.getSigner(0) : provider;
    return { settings, provider, contract: new Contract(settings.contractAddress, DID_REGISTRY_ABI, runner) };
  }

  async status() {
    const settings = await this.settings();
    if (!settings.enabled || !settings.ready) return settings;
    try {
      const { provider, contract } = await this.connection();
      const [network, blockNumber, owner] = await Promise.all([provider.getNetwork(), provider.getBlockNumber(), contract.owner()]);
      return { ...settings, networkChainId: network.chainId.toString(), blockNumber, owner };
    } catch {
      return { ...settings, ready: false, reason: '无法连接本地 EVM 节点或 DidRegistry 合约' };
    }
  }

  async resolveDid(did) {
    const settings = await this.settings();
    const didHash = this.didHash(did);
    if (!settings.enabled || !settings.ready) return { ...settings, did, didHash, registered: false };
    const { contract } = await this.connection();
    const record = await contract.resolveDid(didHash);
    const version = toNumber(record.version);
    return { ...settings, did, didHash, registered: version > 0, controller: record.controller,
      documentHash: record.documentHash, version, deactivated: Boolean(record.deactivated), updatedAt: toNumber(record.updatedAt) || null };
  }

  assertIssuer(did) {
    if (did?.role !== 'issuer') { const error = new Error('只有机构 Issuer DID 可以写入本地链上注册表'); error.code = 'CHAIN_ISSUER_REQUIRED'; throw error; }
  }

  async syncIssuerDid(did) {
    this.assertIssuer(did);
    if (did.status !== 'active') { const error = new Error('已停用 DID 不能同步为活跃链上记录'); error.code = 'CHAIN_DID_DEACTIVATED'; throw error; }
    const { contract, provider, settings } = await this.connection({ write: true });
    const didHash = this.didHash(did.did); const documentHash = this.documentHash(did.document);
    const current = await contract.resolveDid(didHash);
    if (current.deactivated) { const error = new Error('链上 DID 已停用，不能再同步'); error.code = 'CHAIN_DID_DEACTIVATED'; throw error; }
    const transaction = toNumber(current.version) === 0
      ? await contract.registerDid(didHash, documentHash, await contract.runner.getAddress())
      : await contract.updateDid(didHash, documentHash, await contract.runner.getAddress());
    const receipt = await transaction.wait();
    return { ...(await this.resolveDid(did.did)), action: toNumber(current.version) === 0 ? 'registered' : 'updated',
      transactionHash: transaction.hash, blockNumber: receipt.blockNumber, chainId: (await provider.getNetwork()).chainId.toString(), contractAddress: settings.contractAddress };
  }

  async deactivateIssuerDid(did) {
    this.assertIssuer(did);
    if (did.status !== 'deactivated') { const error = new Error('请先在平台完成 DID 停用，再写入链上停用状态'); error.code = 'CHAIN_DEACTIVATION_ORDER'; throw error; }
    const { contract, provider, settings } = await this.connection({ write: true });
    const didHash = this.didHash(did.did); const current = await contract.resolveDid(didHash);
    if (toNumber(current.version) === 0) { const error = new Error('该 DID 尚未上链登记，无法写入停用状态'); error.code = 'CHAIN_DID_NOT_REGISTERED'; throw error; }
    if (current.deactivated) return { ...(await this.resolveDid(did.did)), action: 'already_deactivated' };
    const transaction = await contract.deactivateDid(didHash); const receipt = await transaction.wait();
    return { ...(await this.resolveDid(did.did)), action: 'deactivated', transactionHash: transaction.hash,
      blockNumber: receipt.blockNumber, chainId: (await provider.getNetwork()).chainId.toString(), contractAddress: settings.contractAddress };
  }
}
