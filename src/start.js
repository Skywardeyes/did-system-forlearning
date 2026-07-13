import { bootstrap } from './bootstrap.js';

const port = Number(process.env.PORT || 4173);

try {
  const { server } = await bootstrap();
  server.listen(port, '127.0.0.1', () => console.log(`DID/VC Learning Lab running at http://127.0.0.1:${port}`));
} catch (error) {
  console.error(`[${error.code || 'STARTUP_FAILED'}] ${error.message}`);
  process.exitCode = 1;
}
