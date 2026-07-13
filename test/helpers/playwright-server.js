import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const directory = await mkdtemp(path.join(os.tmpdir(), 'did-vc-playwright-'));
process.env.DATA_FILE = path.join(directory, 'store.json');
process.env.LOG_FILE = path.join(directory, 'logs.json');
process.env.PORT = process.env.PLAYWRIGHT_PORT || '4174';

const { JsonStore } = await import('../../src/store.js');
const { LogStore } = await import('../../src/log-store.js');
const { LogService } = await import('../../src/log-service.js');
const { VcService } = await import('../../src/vc-service.js');
const { createAppServer } = await import('../../src/server.js');
const store = new JsonStore(process.env.DATA_FILE);
const logService = new LogService(new LogStore(process.env.LOG_FILE));
const server = createAppServer(new VcService(store), { logService });

async function cleanup() {
  await rm(directory, { recursive: true, force: true });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(() => cleanup().finally(() => process.exit(0)));
  });
}

server.listen(Number(process.env.PORT), '127.0.0.1', () => {
  console.log(`Playwright test server running at http://127.0.0.1:${process.env.PORT}`);
});
