import { bootstrap } from './bootstrap.js';

const portArgument = process.argv.find((value) => value.startsWith('--port='))?.slice('--port='.length);
const port = Number(portArgument || process.env.PORT || 4173);

try {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
  const { server } = await bootstrap();
  server.listen(port, '127.0.0.1', () => console.log(`DID/VC Learning Lab running at http://127.0.0.1:${port}`));
} catch (error) {
  console.error(`[${error.code || 'STARTUP_FAILED'}] ${error.message}`);
  process.exitCode = 1;
}
