import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContractFactory, JsonRpcProvider } from 'ethers';
import { compileDidRegistry } from './compile.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:8545';

async function main() {
  const provider = new JsonRpcProvider(rpcUrl);
  try {
    const signer = await provider.getSigner(0);
    const { abi, bytecode } = await compileDidRegistry();
    const contract = await new ContractFactory(abi, bytecode, signer).deploy();
    await contract.waitForDeployment();
    const network = await provider.getNetwork();
    const deployment = {
      contractAddress: await contract.getAddress(), chainId: network.chainId.toString(), rpcUrl,
      deployedAt: new Date().toISOString(), deployTransaction: contract.deploymentTransaction()?.hash || null,
    };
    await mkdir(path.join(root, 'data'), { recursive: true });
    await writeFile(path.join(root, 'data', 'chain-deployment.json'), `${JSON.stringify(deployment, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    process.stdout.write(`${JSON.stringify(deployment, null, 2)}\n`);
  } finally { provider.destroy(); }
}

main().catch((error) => { process.stderr.write(`DidRegistry deployment failed: ${error.message}\n`); process.exitCode = 1; });
