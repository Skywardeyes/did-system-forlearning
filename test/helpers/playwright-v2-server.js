process.env.APP_DATA_MODE = 'v2';
process.env.PORT = process.env.PLAYWRIGHT_V2_PORT || '4175';

const { bootstrap } = await import('../../src/bootstrap.js');
const { server, pool } = await bootstrap();

async function cleanup() {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  await pool.end();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => cleanup().finally(() => process.exit(0)));
}

server.listen(Number(process.env.PORT), '127.0.0.1', () => {
  console.log(`V2 Playwright server running at http://127.0.0.1:${process.env.PORT}`);
});
