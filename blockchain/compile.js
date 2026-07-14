import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'blockchain', 'contracts', 'DidRegistry.sol');

export async function compileDidRegistry() {
  const source = await readFile(sourcePath, 'utf8');
  const input = {
    language: 'Solidity',
    sources: { 'DidRegistry.sol': { content: source } },
    settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter((entry) => entry.severity === 'error');
  if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join('\n'));
  const contract = output.contracts?.['DidRegistry.sol']?.DidRegistry;
  if (!contract?.evm?.bytecode?.object) throw new Error('DidRegistry compilation did not produce bytecode');
  return { abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  compileDidRegistry().then(({ abi, bytecode }) => process.stdout.write(`DidRegistry compiled: ${abi.length} ABI entries, ${bytecode.length / 2 - 1} bytes\n`))
    .catch((error) => { process.stderr.write(`Contract compilation failed: ${error.message}\n`); process.exitCode = 1; });
}
