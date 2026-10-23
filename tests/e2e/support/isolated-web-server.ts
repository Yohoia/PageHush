import { createServer } from 'vite';
import { buildServer } from '../../../packages/api/src/server.js';
import { createAccessCodeHash } from '../../../packages/api/src/auth/access-code.js';
import {
  createTestDatabase,
  FakeStorage,
  TEST_ACCESS_CODE,
} from '../../../packages/api/src/test-support/integration.js';

const database = await createTestDatabase();
const app = await buildServer({
  database,
  storage: new FakeStorage(),
  authConfig: {
    accessCodeHash: await createAccessCodeHash(TEST_ACCESS_CODE),
    cookieSecure: false,
  },
  deviceAuth: { verificationUri: 'http://127.0.0.1:5193/device' },
});
await app.listen({ host: '127.0.0.1', port: 8793 });

const web = await createServer({
  configFile: 'packages/web/vite.config.ts',
  envDir: false,
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('') },
  server: {
    host: '127.0.0.1',
    port: 5193,
    strictPort: true,
    proxy: { '/v1': 'http://127.0.0.1:8793' },
  },
});
await web.listen();

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await web.close();
  await app.close();
}
process.once('SIGTERM', () => void close());
process.once('SIGINT', () => void close());
