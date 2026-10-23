import { afterEach, describe, expect, it } from 'vitest';
import { createAccessCodeHash } from './auth/access-code.js';
import { buildServer } from './server.js';
import { FakeStorage, TEST_ACCESS_CODE } from './test-support/integration.js';
import { createPostgresTestDatabase } from './test-support/postgres.js';

const connection = process.env.PAGEHUSH_TEST_DATABASE_URL;
let server: Awaited<ReturnType<typeof buildServer>> | undefined;
afterEach(async () => server?.close());

describe.skipIf(!connection)(
  'device authorization over HTTP with multiple PostgreSQL connections',
  () => {
    it('serializes duplicate approvals and consumes one authorization exactly once', async () => {
      if (!connection) throw new Error('Explicit test database required');
      server = await buildServer({
        database: await createPostgresTestDatabase(connection),
        storage: new FakeStorage(),
        authConfig: {
          accessCodeHash: await createAccessCodeHash(TEST_ACCESS_CODE),
          cookieSecure: false,
        },
      });
      const origin = await server.listen({ host: '127.0.0.1', port: 0 });
      const post = (path: string, body: unknown, cookie?: string) =>
        fetch(`${origin}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
          body: JSON.stringify(body),
        });
      const author = await post('/v1/auth/login', { accessCode: TEST_ACCESS_CODE });
      const cookie = author.headers.get('set-cookie')?.split(';')[0];
      if (!cookie) throw new Error('Author session unavailable');
      const authorization = await (
        await post('/v1/auth/device/code', { name: 'Concurrent terminal' })
      ).json();
      const approvals = await Promise.all(
        Array.from({ length: 8 }, () =>
          post(
            '/v1/auth/device/verify',
            {
              user_code: authorization.user_code,
              decision: 'approve',
            },
            cookie,
          ),
        ),
      );
      expect(approvals.map((response) => response.status)).toEqual(Array(8).fill(200));
      const tokens = await Promise.all(
        Array.from({ length: 8 }, () =>
          post('/v1/auth/device/token', {
            device_code: authorization.device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }),
        ),
      );
      expect(tokens.filter((response) => response.status === 200)).toHaveLength(1);
      expect(tokens.filter((response) => response.status === 400)).toHaveLength(7);
      const issued = tokens.find((response) => response.status === 200);
      if (!issued) throw new Error('No device token issued');
      const token = await issued.json();
      const list = await fetch(`${origin}/v1/auth/devices`, { headers: { cookie } }).then(
        (response) => response.json(),
      );
      expect(list.items).toHaveLength(1);
      const revoked = await fetch(`${origin}/v1/auth/devices/${list.items[0].id}`, {
        method: 'DELETE',
        headers: { cookie },
      });
      expect(revoked.status).toBe(204);
      const session = await fetch(`${origin}/v1/auth/device/session`, {
        headers: { authorization: `Bearer ${token.access_token}` },
      });
      expect(session.status).toBe(401);
    });
  },
);
