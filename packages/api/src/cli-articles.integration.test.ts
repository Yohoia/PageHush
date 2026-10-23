import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { createTestDatabase, FakeStorage } from './test-support/integration.js';
import { cliArticleRoutes } from './routes/cli-articles.js';
import type { PageHushFastifyInstance } from './types/fastify.js';

let app: PageHushFastifyInstance;
beforeEach(async () => {
  const database = await createTestDatabase();
  app = Fastify() as PageHushFastifyInstance;
  app.decorate('database', database.db);
  app.decorate('storage', new FakeStorage());
  app.addHook('preHandler', async (request) => {
    request.deviceSession = {
      id:
        typeof request.headers['x-test-device'] === 'string'
          ? request.headers['x-test-device']
          : 'device-a',
      expiresAt: new Date(Date.now() + 86_400_000),
    };
  });
  app.addHook('onClose', async () => database.close());
  await app.register(multipart);
  await cliArticleRoutes(app);
});
afterEach(async () => app.close());

it('creates a draft once, returns its operation result and resolves the complete short ID', async () => {
  const requestId = randomUUID();
  const input = {
    title: '远程草稿',
    description: '说明',
    content: '# 远程草稿\n正文',
    language: 'zh',
    format: 'md',
  };
  const created = await app.inject({
    method: 'POST',
    url: '/v1/cli/articles',
    headers: { 'x-request-id': requestId },
    payload: input,
  });
  expect(created.statusCode).toBe(201);
  const result = created.json();
  expect(result).toMatchObject({
    requestId,
    status: 'succeeded',
    result: { changed: true, article: { title: '远程草稿', status: 'draft', publishedAt: null } },
  });
  const replay = await app.inject({
    method: 'POST',
    url: '/v1/cli/articles',
    headers: { 'x-request-id': requestId },
    payload: {
      format: input.format,
      language: input.language,
      content: input.content,
      description: input.description,
      title: input.title,
    },
  });
  expect(replay.json()).toEqual(result);
  const queried = await app.inject({ method: 'GET', url: `/v1/cli/operations/${requestId}` });
  expect(queried.json()).toEqual(result);
  const detail = await app.inject({
    method: 'GET',
    url: `/v1/cli/articles/${result.result.article.shortId}`,
  });
  expect(detail.json()).toEqual(result.result.article);
  const list = await app.inject({ method: 'GET', url: '/v1/cli/articles' });
  expect(list.json().items).toHaveLength(1);
  const collision = await app.inject({
    method: 'POST',
    url: '/v1/cli/articles',
    headers: { 'x-request-id': requestId },
    payload: { ...input, content: '不同正文' },
  });
  expect(collision.statusCode).toBe(409);
});

it('publishes with an atomic revision, replays its old condition, and soft deletes conditionally', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/v1/cli/articles',
    headers: { 'x-request-id': randomUUID() },
    payload: {
      title: '待发布',
      description: '说明',
      content: '正文',
      format: 'md',
      language: 'zh',
    },
  });
  const article = created.json().result.article;
  const noCondition = await app.inject({
    method: 'POST',
    url: `/v1/cli/articles/${article.id}/publish`,
    headers: { 'x-request-id': randomUUID() },
  });
  expect(noCondition.statusCode).toBe(428);
  const requestId = randomUUID();
  const published = await app.inject({
    method: 'POST',
    url: `/v1/cli/articles/${article.id}/publish`,
    headers: { 'x-request-id': requestId, 'if-match': article.revision },
  });
  expect(published.statusCode).toBe(200);
  expect(published.json().result.article.publishedAt).toEqual(expect.any(String));
  expect(published.json().result.article.revision).not.toBe(article.revision);
  const replay = await app.inject({
    method: 'POST',
    url: `/v1/cli/articles/${article.id}/publish`,
    headers: { 'x-request-id': requestId, 'if-match': article.revision },
  });
  expect(replay.json()).toEqual(published.json());
  const stale = await app.inject({
    method: 'DELETE',
    url: `/v1/cli/articles/${article.id}`,
    headers: { 'x-request-id': randomUUID(), 'if-match': article.revision },
  });
  expect(stale.statusCode).toBe(409);
  const publishedArticle = published.json().result.article;
  const noop = await app.inject({
    method: 'POST',
    url: `/v1/cli/articles/${article.id}/publish`,
    headers: { 'x-request-id': randomUUID(), 'if-match': publishedArticle.revision },
  });
  expect(noop.json().result).toEqual({ article: publishedArticle, changed: false });
  const deleted = await app.inject({
    method: 'DELETE',
    url: `/v1/cli/articles/${article.id}`,
    headers: { 'x-request-id': randomUUID(), 'if-match': publishedArticle.revision },
  });
  expect(deleted.statusCode).toBe(200);
  const read = await app.inject({ method: 'GET', url: `/v1/cli/articles/${article.id}` });
  expect(read.statusCode).toBe(404);
});

it('uploads an image once within its create operation and keeps the source private', async () => {
  const { multipartBody } = await import('./test-support/integration.js');
  const { createHash } = await import('node:crypto');
  const operationId = randomUUID();
  const assetId = randomUUID();
  const content = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const upload = multipartBody(
    { kind: 'inline_image' },
    { field: 'file', filename: 'pic.png', contentType: 'image/png', content },
  );
  const headers = {
    ...upload.headers,
    'x-asset-id': assetId,
    'x-content-sha256': createHash('sha256').update(content).digest('hex'),
  };
  const first = await app.inject({
    method: 'POST',
    url: `/v1/cli/uploads/${operationId}/assets`,
    headers,
    payload: upload.payload,
  });
  expect(first.statusCode).toBe(201);
  expect(first.json()).toEqual({
    id: expect.any(String),
    url: expect.stringMatching(/^\/v1\/assets\//),
  });
  const replay = await app.inject({
    method: 'POST',
    url: `/v1/cli/uploads/${operationId}/assets`,
    headers,
    payload: upload.payload,
  });
  expect(replay.json()).toEqual(first.json());
  const created = await app.inject({
    method: 'POST',
    url: '/v1/cli/articles',
    headers: { 'x-request-id': operationId },
    payload: {
      title: '配图',
      description: '说明',
      content: `![图片](${first.json().url})`,
      format: 'md',
      language: 'zh',
    },
  });
  expect(created.statusCode).toBe(201);
});

it('protects committed and soft-deleted article images, and retries failed orphan object deletion', async () => {
  const { multipartBody } = await import('./test-support/integration.js');
  const { createHash } = await import('node:crypto');
  const { cleanupCliOrphanAssets } = await import('./routes/cli-uploads.js');
  const content = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const upload = async () => {
    const operationId = randomUUID();
    const form = multipartBody(
      { kind: 'inline_image' },
      { field: 'file', filename: 'pic.png', contentType: 'image/png', content },
    );
    const result = await app.inject({
      method: 'POST',
      url: `/v1/cli/uploads/${operationId}/assets`,
      headers: {
        ...form.headers,
        'x-asset-id': randomUUID(),
        'x-content-sha256': createHash('sha256').update(content).digest('hex'),
      },
      payload: form.payload,
    });
    expect(result.statusCode).toBe(201);
    return { operationId, asset: result.json() };
  };
  const keep = await upload();
  const orphan = await upload();
  const created = await app.inject({
    method: 'POST',
    url: '/v1/cli/articles',
    headers: { 'x-request-id': keep.operationId },
    payload: {
      title: '保留',
      description: '说明',
      content: `![图](${keep.asset.url})`,
      format: 'md',
      language: 'zh',
    },
  });
  const article = created.json().result.article;
  await app.inject({
    method: 'DELETE',
    url: `/v1/cli/articles/${article.id}`,
    headers: { 'x-request-id': randomUUID(), 'if-match': article.revision },
  });
  const storage = app.storage!;
  const database = app.database!;
  const before = await cleanupCliOrphanAssets(database, storage, {
    now: new Date(Date.now() + 6 * 86_400_000),
  });
  expect(before.deleted).toBe(0);
  const originalDelete = storage.deleteObject.bind(storage);
  storage.deleteObject = async () => {
    throw new Error('temporary storage failure');
  };
  await expect(
    cleanupCliOrphanAssets(database, storage, { now: new Date(Date.now() + 8 * 86_400_000) }),
  ).rejects.toThrow('temporary storage failure');
  storage.deleteObject = originalDelete;
  const after = await cleanupCliOrphanAssets(database, storage, {
    now: new Date(Date.now() + 8 * 86_400_000),
  });
  expect(after.deleted).toBe(1);
  expect((storage as FakeStorage).objects.size).toBe(1);
  expect(orphan.asset.id).not.toBe(keep.asset.id);
});

it('filters before pagination, has stable ordering, and never resolves a short ID prefix', async () => {
  for (const title of ['Alpha 1', 'Beta', 'Alpha 2']) {
    await app.inject({
      method: 'POST',
      url: '/v1/cli/articles',
      headers: { 'x-request-id': randomUUID() },
      payload: { title, description: '说明', content: '正文', format: 'md', language: 'zh' },
    });
  }
  const page1 = await app.inject({ method: 'GET', url: '/v1/cli/articles?q=Alpha&pageSize=1' });
  expect(page1.json().items).toHaveLength(1);
  expect(page1.json().nextPage).toBe(2);
  const page2 = await app.inject({
    method: 'GET',
    url: '/v1/cli/articles?q=Alpha&pageSize=1&page=2',
  });
  expect(page2.json().items).toHaveLength(1);
  expect(page2.json().nextPage).toBeNull();
  expect(page2.json().items[0].id).not.toBe(page1.json().items[0].id);
  const prefix = await app.inject({
    method: 'GET',
    url: `/v1/cli/articles/${page1.json().items[0].shortId.slice(0, 10)}`,
  });
  expect(prefix.statusCode).toBe(404);
});

it('reports failed and expired operations without accepting a different payload or old request again', async () => {
  const { articleOperations } = await import('./db/schema.js');
  const { eq } = await import('drizzle-orm');
  const id = randomUUID();
  const target = randomUUID();
  const failed = await app.inject({
    method: 'DELETE',
    url: `/v1/cli/articles/${target}`,
    headers: { 'x-request-id': id, 'if-match': randomUUID() },
  });
  expect(failed.statusCode).toBe(404);
  const query = await app.inject({ method: 'GET', url: `/v1/cli/operations/${id}` });
  expect(query.json()).toMatchObject({
    requestId: id,
    status: 'failed',
    error: { code: 'article_not_found' },
  });
  await app
    .database!.update(articleOperations)
    .set({ expiresAt: new Date(Date.now() - 1) })
    .where(eq(articleOperations.id, id));
  const expired = await app.inject({ method: 'GET', url: `/v1/cli/operations/${id}` });
  expect(expired.statusCode).toBe(410);
  const replay = await app.inject({
    method: 'DELETE',
    url: `/v1/cli/articles/${target}`,
    headers: { 'x-request-id': id, 'if-match': 'new-version' },
  });
  expect(replay.statusCode).toBe(409);
});

it('rejects independent asset kinds and preserves a partial image upload for a stable retry', async () => {
  const { multipartBody } = await import('./test-support/integration.js');
  const { createHash } = await import('node:crypto');
  const operationId = randomUUID();
  const uploadId = randomUUID();
  const content = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const send = (kind: string) => {
    const form = multipartBody(
      { kind },
      { field: 'file', filename: 'pic.png', contentType: 'image/png', content },
    );
    return app.inject({
      method: 'POST',
      url: `/v1/cli/uploads/${operationId}/assets`,
      headers: {
        ...form.headers,
        'x-asset-id': uploadId,
        'x-content-sha256': createHash('sha256').update(content).digest('hex'),
      },
      payload: form.payload,
    });
  };
  const disallowed = await send('cover');
  expect(disallowed.statusCode).toBe(403);
  const storage = app.storage!;
  const put = storage.putObject.bind(storage);
  storage.putObject = async (input) => {
    await put(input);
    throw new Error('response lost after image put');
  };
  const partial = await send('inline_image');
  expect(partial.statusCode).toBe(500);
  storage.putObject = put;
  const resumed = await send('inline_image');
  expect(resumed.statusCode).toBe(201);
  expect((storage as FakeStorage).objects.size).toBe(1);
  const pending = await app.inject({ method: 'GET', url: `/v1/cli/operations/${operationId}` });
  expect(pending.json().status).toBe('pending');
});

it('allows a fresh device grant for the same author to query and resume a pending operation', async () => {
  const { multipartBody } = await import('./test-support/integration.js');
  const { createHash } = await import('node:crypto');
  const requestId = randomUUID();
  const content = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const form = multipartBody(
    { kind: 'inline_image' },
    { field: 'file', filename: 'pic.png', contentType: 'image/png', content },
  );
  const image = await app.inject({
    method: 'POST',
    url: `/v1/cli/uploads/${requestId}/assets`,
    headers: {
      ...form.headers,
      'x-test-device': 'device-before-login',
      'x-asset-id': randomUUID(),
      'x-content-sha256': createHash('sha256').update(content).digest('hex'),
    },
    payload: form.payload,
  });
  expect(image.statusCode).toBe(201);
  const pending = await app.inject({
    method: 'GET',
    url: `/v1/cli/operations/${requestId}`,
    headers: { 'x-test-device': 'device-after-login' },
  });
  expect(pending.json()).toEqual({ requestId, status: 'pending' });
  const created = await app.inject({
    method: 'POST',
    url: '/v1/cli/articles',
    headers: { 'x-request-id': requestId, 'x-test-device': 'device-after-login' },
    payload: {
      title: '恢复上传',
      description: '说明',
      content: `![图](${image.json().url})`,
      format: 'md',
      language: 'zh',
    },
  });
  expect(created.statusCode).toBe(201);
  const queried = await app.inject({
    method: 'GET',
    url: `/v1/cli/operations/${requestId}`,
    headers: { 'x-test-device': 'device-third' },
  });
  expect(queried.json()).toEqual(created.json());
});
