import { buildServer } from './server.js';

const host = process.env.PAGEHUSH_API_HOST ?? '127.0.0.1';
const port = Number(process.env.PAGEHUSH_API_PORT ?? '8787');

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PAGEHUSH_API_PORT must be an integer between 1 and 65535');
}

const app = await buildServer();

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
  });
}
