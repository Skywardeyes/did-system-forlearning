import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { verifyEvidenceManifest } from './helpers/test-evidence.js';

const target = process.argv[2] && path.resolve(process.argv[2]);
if (!target) { console.error('用法: npm run test:evidence:verify -- <批次目录>'); process.exitCode = 2; }
else {
  try {
    const manifest = JSON.parse(await readFile(path.join(target, 'evidence-manifest.json'), 'utf8'));
    const result = await verifyEvidenceManifest(target, manifest);
    console.log(JSON.stringify(result, null, 2)); process.exitCode = result.valid ? 0 : 1;
  } catch (error) { console.error(`证据验证失败: ${error.message}`); process.exitCode = 2; }
}
