import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestServer, multipartBody } from './test-support/integration.js';

let server: Awaited<ReturnType<typeof buildTestServer>>;

beforeEach(async () => {
  server = await buildTestServer();
});

afterEach(async () => {
  await server.close();
});

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

async function loginCookie() {
  const response = await server.app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { accessCode: 'test-access-code' },
  });
  expect(response.statusCode).toBe(201);
  const setCookie = response.headers['set-cookie'];
  return (Array.isArray(setCookie) ? setCookie[0] : setCookie)!.split(';')[0]!;
}

describe('assets', () => {
  it('uploads a validated PNG, stores it, and serves the content back', async () => {
    const cookie = await loginCookie();
    const body = multipartBody(
      { kind: 'cover' },
      {
        field: 'file',
        filename: 'cover.png',
        contentType: 'image/png',
        content: PNG_SIGNATURE,
      },
    );

    const upload = await server.app.inject({
      method: 'POST',
      url: '/v1/assets',
      headers: { cookie, ...body.headers },
      payload: body.payload,
    });
    expect(upload.statusCode).toBe(201);

    const asset = upload.json();
    expect(asset.status).toBe('ready');
    expect(asset.kind).toBe('cover');
    expect(asset.url).toBe(`/v1/assets/${asset.id}/content`);
    expect(server.storage.objects.get(asset.objectKey)?.body.equals(PNG_SIGNATURE)).toBe(true);

    const content = await server.app.inject({
      method: 'GET',
      url: asset.url,
      headers: { cookie },
    });
    expect(content.statusCode).toBe(200);
    expect(content.headers['content-type']).toBe('image/png');
    expect(Buffer.from(content.rawPayload).equals(PNG_SIGNATURE)).toBe(true);
  });

  it('rejects files whose bytes contradict the declared MIME type', async () => {
    const cookie = await loginCookie();
    const body = multipartBody(
      { kind: 'cover' },
      {
        field: 'file',
        filename: 'fake.png',
        contentType: 'image/png',
        content: Buffer.from('<html>not an image</html>'),
      },
    );

    const upload = await server.app.inject({
      method: 'POST',
      url: '/v1/assets',
      headers: { cookie, ...body.headers },
      payload: body.payload,
    });
    expect(upload.statusCode).toBe(415);
    expect(upload.json().error).toBe('file_content_mismatch');
  });
});
