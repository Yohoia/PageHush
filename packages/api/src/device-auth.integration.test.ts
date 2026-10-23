import { afterEach, describe, expect, it } from 'vitest';
import { createAccessCodeHash } from './auth/access-code.js';
import { buildServer } from './server.js';
import { createTestDatabase, FakeStorage, TEST_ACCESS_CODE } from './test-support/integration.js';

const servers: Awaited<ReturnType<typeof buildServer>>[] = [];
afterEach(async () => {
  for (const app of servers.splice(0)) await app.close();
});

async function start(now = () => new Date()) {
  const app = await buildServer({
    database: await createTestDatabase(),
    storage: new FakeStorage(),
    authConfig: {
      accessCodeHash: await createAccessCodeHash(TEST_ACCESS_CODE),
      cookieSecure: false,
    },
    deviceAuth: { now },
  });
  servers.push(app);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('HTTP listener unavailable');
  const origin = `http://127.0.0.1:${address.port}`;
  const call = (path: string, init?: RequestInit) => fetch(`${origin}${path}`, init);
  return { app, call };
}

function jsonPost(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

async function authorLogin(call: Awaited<ReturnType<typeof start>>['call']) {
  const response = await call('/v1/auth/login', jsonPost({ accessCode: TEST_ACCESS_CODE }));
  expect(response.status).toBe(201);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Author login did not return a cookie');
  return { cookie };
}

describe('CLI device authorization over HTTP', () => {
  it('lets the signed-in author inspect and approve a device without revealing its token', async () => {
    const { call } = await start();
    const issued = await call('/v1/auth/device/code', jsonPost({ name: 'My terminal' }));
    expect(issued.status).toBe(200);
    const code = await issued.json();
    expect(code).toMatchObject({
      verification_uri: 'https://pagehush.yohoia.cn/device',
      expires_in: 600,
      interval: 5,
    });
    expect(code.user_code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(code.verification_uri_complete).toBe(
      `${code.verification_uri}?user_code=${code.user_code}`,
    );
    const headers = await authorLogin(call);
    const inspect = await call(`/v1/auth/device/verify?user_code=${code.user_code}`, { headers });
    expect(inspect.status).toBe(200);
    expect(await inspect.json()).toMatchObject({ name: 'My terminal', status: 'pending' });
    const approved = await call(
      '/v1/auth/device/verify',
      jsonPost({ user_code: code.user_code, decision: 'approve' }, headers),
    );
    expect(approved.status).toBe(200);
    const approval = await approved.json();
    expect(approval).toMatchObject({ name: 'My terminal', status: 'approved' });
    expect(approval).not.toHaveProperty('access_token');
    expect(approval).not.toHaveProperty('device_code');
    const tokenResponse = await call(
      '/v1/auth/device/token',
      jsonPost({
        device_code: code.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    );
    expect(tokenResponse.status).toBe(200);
    const token = await tokenResponse.json();
    expect(token).toMatchObject({ token_type: 'Bearer', expires_in: 30 * 24 * 60 * 60 });
    const session = await call('/v1/auth/device/session', {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ authenticated: true, name: 'My terminal' });
  });

  it('rejects anonymous approvals, throttles polling, and reports denial or expiration', async () => {
    let now = new Date('2026-10-23T00:00:00Z');
    const { call } = await start(() => now);
    const code = await (await call('/v1/auth/device/code', jsonPost({}))).json();
    const tokenBody = {
      device_code: code.device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    };
    const anonymous = await call(
      '/v1/auth/device/verify',
      jsonPost({ user_code: code.user_code, decision: 'approve' }),
    );
    expect(anonymous.status).toBe(401);
    const pending = await call('/v1/auth/device/token', jsonPost(tokenBody));
    expect(pending.status).toBe(400);
    expect(await pending.json()).toEqual({ error: 'authorization_pending' });
    const rapid = await call('/v1/auth/device/token', jsonPost(tokenBody));
    expect(rapid.status).toBe(400);
    expect(await rapid.json()).toEqual({ error: 'slow_down', interval: 10 });
    const headers = await authorLogin(call);
    const denied = await call(
      '/v1/auth/device/verify',
      jsonPost({ user_code: code.user_code, decision: 'deny' }, headers),
    );
    expect(denied.status).toBe(200);
    expect(await (await call('/v1/auth/device/token', jsonPost(tokenBody))).json()).toEqual({
      error: 'access_denied',
    });
    const reversing = await call(
      '/v1/auth/device/verify',
      jsonPost({ user_code: code.user_code, decision: 'approve' }, headers),
    );
    expect(reversing.status).toBe(409);
    const expiring = await (await call('/v1/auth/device/code', jsonPost({}))).json();
    now = new Date(now.getTime() + 600_000);
    const expired = await call(
      '/v1/auth/device/token',
      jsonPost({ ...tokenBody, device_code: expiring.device_code }),
    );
    expect(await expired.json()).toEqual({ error: 'expired_token' });
    const lateApproval = await call(
      '/v1/auth/device/verify',
      jsonPost({ user_code: expiring.user_code, decision: 'approve' }, headers),
    );
    expect(lateApproval.status).toBe(410);
    const unknown = await call(
      '/v1/auth/device/token',
      jsonPost({ ...tokenBody, device_code: 'not-an-issued-code' }),
    );
    expect(await unknown.json()).toEqual({ error: 'invalid_grant' });
  });

  it('restricts devices to CLI scope and lets authors revoke a device or the device log itself out', async () => {
    const { call } = await start();
    const author = await authorLogin(call);
    async function authorize(name: string) {
      const code = await (await call('/v1/auth/device/code', jsonPost({ name }))).json();
      const approval = { user_code: code.user_code, decision: 'approve' };
      expect((await call('/v1/auth/device/verify', jsonPost(approval, author))).status).toBe(200);
      expect((await call('/v1/auth/device/verify', jsonPost(approval, author))).status).toBe(200);
      const tokenBody = {
        device_code: code.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      };
      const token = await (await call('/v1/auth/device/token', jsonPost(tokenBody))).json();
      const replay = await call('/v1/auth/device/token', jsonPost(tokenBody));
      expect(replay.status).toBe(400);
      expect(await replay.json()).toEqual({ error: 'invalid_grant' });
      expect((await call('/v1/auth/device/verify', jsonPost(approval, author))).status).toBe(409);
      return { authorization: `Bearer ${token.access_token}` };
    }
    const device = await authorize('Revocable terminal');
    const articles = await call('/v1/cli/articles', { headers: device });
    expect(articles.status).toBe(200);
    expect(await articles.json()).toMatchObject({ items: [] });
    expect((await call('/v1/cli/articles', { headers: author })).status).toBe(401);
    for (const path of [
      '/v1/articles',
      '/v1/assets',
      '/v1/topics',
      '/v1/tags',
      '/v1/auth/devices',
    ]) {
      expect((await call(path, { headers: device })).status).toBe(403);
    }
    const deviceList = await call('/v1/auth/devices', { headers: author });
    const { items } = await deviceList.json();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Revocable terminal', revokedAt: null });
    expect(items[0]).not.toHaveProperty('tokenHash');
    const revoke = await call(`/v1/auth/devices/${items[0].id}`, {
      method: 'DELETE',
      headers: author,
    });
    expect(revoke.status).toBe(204);
    expect((await call('/v1/auth/device/session', { headers: device })).status).toBe(401);
    const ownDevice = await authorize('Logging-out terminal');
    expect(
      (await call('/v1/auth/device/logout', { method: 'DELETE', headers: ownDevice })).status,
    ).toBe(204);
    expect((await call('/v1/auth/device/session', { headers: ownDevice })).status).toBe(401);
    const all = await (await call('/v1/auth/devices', { headers: author })).json();
    expect(all.items).toHaveLength(2);
    expect(all.items.every((item: { revokedAt: string | null }) => item.revokedAt !== null)).toBe(
      true,
    );
  });

  it('expires the issued token after thirty days and never derives the approval URL from an untrusted Host', async () => {
    let now = new Date('2026-10-23T00:00:00Z');
    const { call } = await start(() => now);
    const code = await (
      await call(
        '/v1/auth/device/code',
        jsonPost({}, { host: 'attacker.example', 'x-forwarded-host': 'attacker.example' }),
      )
    ).json();
    expect(code.verification_uri).toBe('https://pagehush.yohoia.cn/device');
    const author = await authorLogin(call);
    await call(
      '/v1/auth/device/verify',
      jsonPost({ user_code: code.user_code, decision: 'approve' }, author),
    );
    const token = await (
      await call(
        '/v1/auth/device/token',
        jsonPost({
          device_code: code.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      )
    ).json();
    const device = { authorization: `Bearer ${token.access_token}` };
    expect((await call('/v1/auth/device/session', { headers: device })).status).toBe(200);
    now = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    expect((await call('/v1/auth/device/session', { headers: device })).status).toBe(401);
  });
});
