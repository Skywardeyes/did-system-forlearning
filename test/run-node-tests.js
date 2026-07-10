import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testRoot = path.dirname(fileURLToPath(import.meta.url));

async function discover(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'ui' || entry.name === 'helpers') continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await discover(target));
    else if (entry.name.endsWith('.test.js')) files.push(target);
  }
  return files;
}

const files = (await discover(testRoot)).sort();
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
