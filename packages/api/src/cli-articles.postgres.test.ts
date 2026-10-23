import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPostgresTestDatabase } from './test-support/postgres.js';
import { FakeStorage } from './test-support/integration.js';
import { cliArticleRoutes } from './routes/cli-articles.js';
import { articleRoutes } from './routes/articles.js';
import type { PageHushFastifyInstance } from './types/fastify.js';

const connection = process.env.PAGEHUSH_TEST_DATABASE_URL;
let app: PageHushFastifyInstance;
let base: string;

describe.skipIf(!connection)(
  'remote articles over HTTP with multiple PostgreSQL connections',
  () => {
    beforeEach(async () => {
      const database = await createPostgresTestDatabase(connection!);
      app = Fastify() as PageHushFastifyInstance;
      app.decorate('database', database.db);
      app.decorate('storage', new FakeStorage());
      app.addHook('preHandler', async (request) => {
        request.deviceSession = { id: 'test-device', expiresAt: new Date(Date.now() + 86_400_000) };
      });
      app.addHook('onClose', async () => database.close());
      await app.register(multipart);
      await cliArticleRoutes(app);
      await articleRoutes(app);
      base = await app.listen({ host: '127.0.0.1', port: 0 });
    });
    afterEach(async () => app?.close());

    it('commits one article for concurrent duplicate requests', async () => {
      const requestId = randomUUID();
      const payload = {
        title: '并发去重',
        description: '说明',
        content: '正文',
        format: 'md',
        language: 'zh',
      };
      const responses = await Promise.all(
        Array.from({ length: 8 }, () =>
          fetch(`${base}/v1/cli/articles`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-request-id': requestId },
            body: JSON.stringify(payload),
          }),
        ),
      );
      expect(responses.map((response) => response.status)).toEqual(Array(8).fill(201));
      const outcomes = await Promise.all(responses.map((response) => response.json()));
      expect(new Set(outcomes.map((outcome) => outcome.result.article.id)).size).toBe(1);
      const list = await fetch(`${base}/v1/cli/articles`).then((response) => response.json());
      expect(list.items).toHaveLength(1);
    });

    it('lets exactly one simultaneous webpage edit or CLI publish use the same revision', async () => {
      const created = await fetch(`${base}/v1/cli/articles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': randomUUID() },
        body: JSON.stringify({
          title: '竞争发布',
          description: '说明',
          content: '正文',
          format: 'md',
          language: 'zh',
        }),
      }).then((response) => response.json());
      const article = created.result.article;
      const responses = await Promise.all([
        fetch(`${base}/v1/articles/${article.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', 'if-match': article.revision },
          body: JSON.stringify({ content: '网页新正文' }),
        }),
        fetch(`${base}/v1/cli/articles/${article.id}/publish`, {
          method: 'POST',
          headers: { 'x-request-id': randomUUID(), 'if-match': article.revision },
        }),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
      const current = await fetch(`${base}/v1/cli/articles/${article.id}`).then((response) =>
        response.json(),
      );
      expect(current.revision).not.toBe(article.revision);
      expect(
        current.status === 'published'
          ? current.content === '正文'
          : current.content === '网页新正文',
      ).toBe(true);
    });

    it('serializes duplicate image puts and coordinates collection with a fresh article commit', async () => {
      const { createHash } = await import('node:crypto');
      const { multipartBody } = await import('./test-support/integration.js');
      const { cleanupCliOrphanAssets } = await import('./routes/cli-uploads.js');
      const { articleOperations, cliAssetUploads } = await import('./db/schema.js');
      const { eq } = await import('drizzle-orm');
      const operationId = randomUUID();
      const uploadId = randomUUID();
      const content = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const form = multipartBody(
        { kind: 'inline_image' },
        { field: 'file', filename: 'pic.png', contentType: 'image/png', content },
      );
      const headers = {
        ...form.headers,
        'x-asset-id': uploadId,
        'x-content-sha256': createHash('sha256').update(content).digest('hex'),
      };
      const uploads = await Promise.all(
        Array.from({ length: 6 }, () =>
          fetch(`${base}/v1/cli/uploads/${operationId}/assets`, {
            method: 'POST',
            headers,
            body: form.payload,
          }),
        ),
      );
      expect(uploads.map((response) => response.status)).toEqual(Array(6).fill(201));
      const results = await Promise.all(uploads.map((response) => response.json()));
      expect(new Set(results.map((result) => result.id)).size).toBe(1);
      const storage = app.storage as FakeStorage;
      expect(storage.objects.size).toBe(1);
      const database = app.database!;
      await database
        .update(articleOperations)
        .set({ expiresAt: new Date(Date.now() - 1) })
        .where(eq(articleOperations.id, operationId));
      await database
        .update(cliAssetUploads)
        .set({ createdAt: new Date(Date.now() - 8 * 86_400_000) })
        .where(eq(cliAssetUploads.id, uploadId));
      const [creation, collection] = await Promise.all([
        fetch(`${base}/v1/cli/articles`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-request-id': randomUUID() },
          body: JSON.stringify({
            title: '竞争引用',
            description: '说明',
            content: `![图](${results[0].url})`,
            format: 'md',
            language: 'zh',
          }),
        }),
        cleanupCliOrphanAssets(database, storage),
      ]);
      expect([201, 400]).toContain(creation.status);
      const list = await fetch(`${base}/v1/cli/articles`).then((response) => response.json());
      if (creation.status === 201) {
        expect(list.items).toHaveLength(1);
        expect(collection.deleted).toBe(0);
        expect(storage.objects.size).toBe(1);
      } else {
        expect(list.items).toHaveLength(0);
        expect(collection.deleted).toBe(1);
        expect(storage.objects.size).toBe(0);
      }
    });
    it('preserves explicit publication and update dates when importing an already published article', async () => {
      const response = await fetch(`${base}/v1/articles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: '历史文章',
          description: '说明',
          content: '正文',
          status: 'published',
          publishedAt: '2020-01-02T03:04:05.000Z',
          updatedAt: '2021-02-03T04:05:06.000Z',
        }),
      });
      expect(response.status).toBe(201);
      const article = await response.json();
      expect(article.publishedAt).toBe('2020-01-02T03:04:05.000Z');
      expect(article.firstPublishedAt).toBe('2020-01-02T03:04:05.000Z');
      expect(article.updatedAt).toBe('2021-02-03T04:05:06.000Z');
      const publishedAgain = await fetch(`${base}/v1/cli/articles/${article.id}/publish`, {
        method: 'POST',
        headers: { 'x-request-id': randomUUID(), 'if-match': article.revision },
      }).then((result) => result.json());
      expect(publishedAgain.result.changed).toBe(false);
      expect(publishedAgain.result.article.updatedAt).toBe('2021-02-03T04:05:06.000Z');
      expect(publishedAgain.result.article.publishedAt).toBe('2020-01-02T03:04:05.000Z');
    });
    it('clears draft edit dates at the first publication while preserving an explicit valid web update date', async () => {
      const draft = async () => {
        const response = await fetch(`${base}/v1/articles`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: '待首次发布',
            description: '说明',
            content: '正文',
            publishedAt: '2020-01-02T03:04:05.000Z',
            updatedAt: '2021-02-03T04:05:06.000Z',
          }),
        });
        expect(response.status).toBe(201);
        return response.json();
      };
      const cliDraft = await draft();
      const before = Date.now();
      const cli = await fetch(`${base}/v1/cli/articles/${cliDraft.id}/publish`, {
        method: 'POST',
        headers: { 'x-request-id': randomUUID(), 'if-match': cliDraft.revision },
      }).then((response) => response.json());
      expect(cli.result.article.updatedAt).toBeNull();
      expect(Date.parse(cli.result.article.publishedAt)).toBeGreaterThanOrEqual(before);
      const webDraft = await draft();
      const web = await fetch(`${base}/v1/articles/${webDraft.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'if-match': webDraft.revision },
        body: JSON.stringify({ status: 'published', content: '同时修改的正文' }),
      });
      expect(web.status).toBe(200);
      expect((await web.json()).updatedAt).toBeNull();
      const explicitDraft = await draft();
      const explicit = await fetch(`${base}/v1/articles/${explicitDraft.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'if-match': explicitDraft.revision },
        body: JSON.stringify({ status: 'published', updatedAt: '2099-01-01T00:00:00.000Z' }),
      });
      expect(explicit.status).toBe(200);
      expect((await explicit.json()).updatedAt).toBe('2099-01-01T00:00:00.000Z');
      const invalidDraft = await draft();
      const invalid = await fetch(`${base}/v1/articles/${invalidDraft.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'if-match': invalidDraft.revision },
        body: JSON.stringify({ status: 'published', updatedAt: '2021-01-01T00:00:00.000Z' }),
      });
      expect(invalid.status).toBe(400);
      const unchanged = await fetch(`${base}/v1/cli/articles/${invalidDraft.id}`).then((response) =>
        response.json(),
      );
      expect(unchanged.status).toBe('draft');
      expect(unchanged.revision).toBe(invalidDraft.revision);
    });
  },
);
