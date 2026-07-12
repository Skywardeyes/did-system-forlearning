import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('test-records'); const rows = [];
try {
  for (const date of await readdir(root)) for (const run of await readdir(path.join(root, date))) {
    try { const m = JSON.parse(await readFile(path.join(root, date, run, 'metadata.json'), 'utf8')); rows.push(m); } catch {}
  }
} catch {}
rows.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
for (const row of rows) console.log(`${row.startedAtLocal}\t${row.exitCode === 0 ? '通过' : '失败'}\t${row.git.commit}\t${row.git.clean ? '干净' : '含未提交修改'}\t${row.runId}`);
console.log(`共 ${rows.length} 个永久保留批次`);
