process.env.APP_DATA_MODE = 'v2';
process.env.SERVE_FRONTEND = 'false';
process.env.PORT = process.env.PLAYWRIGHT_VUE_API_PORT || '4177';

const { bootstrap } = await import('../../src/bootstrap.js');
const { server, pool } = await bootstrap();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    if (server.listening) server.close();
    pool.end().catch(() => {});
    // Playwright owns this disposable process. Do not let an open keep-alive
    // connection delay test reporting after the browser has already stopped.
    setTimeout(() => process.exit(0), 100).unref();
  });
}

server.listen(Number(process.env.PORT), '127.0.0.1', () => {
  console.log(`Vue API server running at http://127.0.0.1:${process.env.PORT}`);
});
