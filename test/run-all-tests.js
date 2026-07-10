import { spawnSync } from 'node:child_process';

const npmCli = process.env.npm_execpath;
let failed = false;

for (const script of ['test:node', 'test:ui']) {
  const result = spawnSync(process.execPath, [npmCli, 'run', script], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
