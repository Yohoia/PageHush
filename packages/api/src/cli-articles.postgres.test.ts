import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPostgresTestDatabase } from './test-support/postgres.js';
import { FakeStorage } from './test-support/integration.js';
import { cliArticleRoutes } from './routes/cli-articles.js';
import { articleRoutes } from './routes/articles.js';
import { assetRoutes } from './routes/assets.js';
import { topicRoutes } from './routes/topics.js';
import { tagRoutes } from './routes/tags.js';
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
      await assetRoutes(app);
      await topicRoutes(app);
      await tagRoutes(app);
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

    it('preserves external asset-shaped URLs and code examples on CLI create and webpage edit', async () => {
      const id = randomUUID();
      const content = [
        `![外链](https://other.example/v1/assets/${id}/content)`,
        `\`![行内示例](/v1/assets/${id}/content)\``,
        '```md',
        `![代码示例](/v1/assets/${id}/content)`,
        '```',
        `<pre><img src="/v1/assets/${id}/content"></pre>`,
      ].join('\n\n');
      const created = await fetch(`${base}/v1/cli/articles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': randomUUID() },
        body: JSON.stringify({
          title: '外链与示例',
          description: '说明',
          content,
          format: 'md',
          language: 'zh',
        }),
      });
      expect(created.status).toBe(201);
      const article = (await created.json()).result.article;
      expect(article.content).toBe(content);
      const edited = await fetch(`${base}/v1/articles/${article.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'if-match': article.revision },
        body: JSON.stringify({ content: `${content}\n\n网页更新` }),
      });
      expect(edited.status).toBe(200);
      expect((await edited.json()).content).toBe(`${content}\n\n网页更新`);
    });

    it('protects rendered local references but collects images mentioned only in external URLs or code', async () => {
      const { createHash } = await import('node:crypto');
      const { multipartBody } = await import('./test-support/integration.js');
      const { cleanupCliOrphanAssets } = await import('./routes/cli-uploads.js');
      const upload = async () => {
        const content = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const body = multipartBody(
          { kind: 'inline_image' },
          { field: 'file', filename: 'pic.png', contentType: 'image/png', content },
        );
        const response = await fetch(`${base}/v1/cli/uploads/${randomUUID()}/assets`, {
          method: 'POST',
          headers: {
            ...body.headers,
            'x-asset-id': randomUUID(),
            'x-content-sha256': createHash('sha256').update(content).digest('hex'),
          },
          body: body.payload,
        });
        expect(response.status).toBe(201);
        return response.json();
      };
      const markdown = await upload();
      const html = await upload();
      const absolute = await upload();
      const example = await upload();
      const created = await fetch(`${base}/v1/cli/articles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': randomUUID() },
        body: JSON.stringify({
          title: '素材保护',
          description: '说明',
          format: 'md',
          language: 'zh',
          content: `![图片][asset]\n\n[asset]: /unused/..${markdown.url}?v=1\n\n<img srcset="//pagehush.yohoia.cn${html.url} 1x">\n\n<img src="https://pagehush.yohoia.cn${absolute.url}">\n\n![外链](//other.example${example.url})\n\n\`![代码](${example.url})\``,
        }),
      });
      expect(created.status).toBe(201);
      const article = (await created.json()).result.article;
      const storage = app.storage as FakeStorage;
      const future = new Date(Date.now() + 8 * 86_400_000);
      const draftCollection = await cleanupCliOrphanAssets(app.database!, storage, {
        now: future,
        limit: 1,
      });
      expect(draftCollection.deleted).toBe(1);
      for (const image of [markdown, html, absolute])
        expect((await fetch(`${base}${image.url}`)).status).toBe(200);
      expect((await fetch(`${base}${example.url}`)).status).toBe(404);
      const secondArticle = await fetch(`${base}/v1/cli/articles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': randomUUID() },
        body: JSON.stringify({
          title: '另一篇引用文章',
          description: '说明',
          content: `![共享素材](${markdown.url})`,
          format: 'md',
          language: 'zh',
        }),
      });
      expect(secondArticle.status).toBe(201);
      const removed = await fetch(`${base}/v1/cli/articles/${article.id}`, {
        method: 'DELETE',
        headers: { 'x-request-id': randomUUID(), 'if-match': article.revision },
      });
      expect(removed.status).toBe(200);
      const collection = await cleanupCliOrphanAssets(app.database!, storage, {
        now: future,
        limit: 1,
      });
      expect(collection.deleted).toBe(0);
      expect(storage.objects.size).toBe(3);
    });

    it('rejects malformed list query parameters at the HTTP boundary', async () => {
      for (const query of [
        'q=foo&q=bar',
        'status=draft&status=published',
        'page=1&page=2',
        'pageSize=1&pageSize=2',
        'status=deleted',
        'status=',
        'page=0',
        'page=-1',
        'page=1.5',
        'page=9007199254740992',
        'pageSize=0',
        'pageSize=201',
        'pageSize=1.5',
        'page=9007199254740991&pageSize=200',
      ]) {
        const response = await fetch(`${base}/v1/cli/articles?${query}`);
        expect(response.status, query).toBe(400);
      }
      for (const query of ['', 'q=', 'status=draft&page=1&pageSize=1', 'pageSize=200']) {
        const response = await fetch(`${base}/v1/cli/articles?${query}`);
        expect(response.status, query).toBe(200);
        expect((await response.json()).items).toEqual([]);
      }
    });

    it('keeps a CLI image referenced by an existing MDX expression and rejects reattaching collected assets', async () => {
      const { createHash } = await import('node:crypto');
      const { multipartBody } = await import('./test-support/integration.js');
      const { cleanupCliOrphanAssets } = await import('./routes/cli-uploads.js');
      const content = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const form = multipartBody(
        { kind: 'inline_image' },
        { field: 'file', filename: 'mdx.png', contentType: 'image/png', content },
      );
      const uploaded = await fetch(`${base}/v1/cli/uploads/${randomUUID()}/assets`, {
        method: 'POST',
        headers: {
          ...form.headers,
          'x-asset-id': randomUUID(),
          'x-content-sha256': createHash('sha256').update(content).digest('hex'),
        },
        body: form.payload,
      });
      expect(uploaded.status).toBe(201);
      const image = await uploaded.json();
      const created = await fetch(`${base}/v1/articles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: '既有MDX',
          content: `<Image src={"${image.url}"} />\n\n<Image src={"/v1/assets/${randomUUID()}/content"} />`,
          format: 'mdx',
        }),
      });
      expect(created.status).toBe(201);
      const article = await created.json();
      const result = await cleanupCliOrphanAssets(app.database!, app.storage!, {
        now: new Date(Date.now() + 8 * 86_400_000),
      });
      expect(result.deleted).toBe(0);
      expect((await fetch(`${base}${image.url}`)).status).toBe(200);
      const removedReference = await fetch(`${base}/v1/articles/${article.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'if-match': article.revision },
        body: JSON.stringify({ content: '已移除素材引用' }),
      });
      expect(removedReference.status).toBe(200);
      const current = await removedReference.json();
      const collection = await cleanupCliOrphanAssets(app.database!, app.storage!, {
        now: new Date(Date.now() + 8 * 86_400_000),
      });
      expect(collection.deleted).toBe(1);
      const reattached = await fetch(`${base}/v1/articles/${article.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'if-match': current.revision },
        body: JSON.stringify({ content: `<Image src={"${image.url}"} />` }),
      });
      expect(reattached.status).toBe(400);
      const unchanged = await fetch(`${base}/v1/cli/articles/${article.id}`).then((response) =>
        response.json(),
      );
      expect(unchanged.revision).toBe(current.revision);
      expect(unchanged.content).toBe('已移除素材引用');
    });

    it.each(['topic rename', 'topic delete', 'topic move', 'tag rename', 'tag delete'])(
      'advances article revisions atomically after %s and rejects stale writes',
      async (change) => {
        const response = await fetch(`${base}/v1/articles`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: '元信息变更',
            description: '说明',
            content: '正文',
            topicName: '原主题',
            tagNames: ['原标签'],
          }),
        });
        expect(response.status).toBe(201);
        const article = await response.json();
        const topic = (await fetch(`${base}/v1/topics`).then((result) => result.json()))[0];
        const tag = (await fetch(`${base}/v1/tags`).then((result) => result.json()))[0];
        let url = change.startsWith('topic')
          ? `${base}/v1/topics/${topic.id}`
          : `${base}/v1/tags/${tag.id}`;
        if (change === 'topic move') {
          const target = await fetch(`${base}/v1/topics`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: '目标主题' }),
          }).then((result) => result.json());
          url += `?moveToTopicId=${target.id}`;
        }
        const rename = change.endsWith('rename');
        const changed = await fetch(url, {
          method: rename ? 'PATCH' : 'DELETE',
          ...(rename
            ? {
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ name: '新名称' }),
              }
            : {}),
        });
        expect(changed.status).toBe(rename ? 200 : 204);
        const current = await fetch(`${base}/v1/cli/articles/${article.id}`).then((result) =>
          result.json(),
        );
        expect(current.revision).not.toBe(article.revision);
        if (change === 'topic rename') expect(current.topic).toBe('新名称');
        if (change === 'topic delete') expect(current.topic).toBeNull();
        if (change === 'topic move') expect(current.topic).toBe('目标主题');
        if (change === 'tag rename') expect(current.tags).toEqual(['新名称']);
        if (change === 'tag delete') expect(current.tags).toEqual([]);
        const publish = await fetch(`${base}/v1/cli/articles/${article.id}/publish`, {
          method: 'POST',
          headers: { 'x-request-id': randomUUID(), 'if-match': article.revision },
        });
        expect(publish.status).toBe(409);
        const edit = await fetch(`${base}/v1/articles/${article.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', 'if-match': article.revision },
          body: JSON.stringify({ content: '旧版本覆盖' }),
        });
        expect(edit.status).toBe(409);
        const unchanged = await fetch(`${base}/v1/cli/articles/${article.id}`).then((result) =>
          result.json(),
        );
        expect(unchanged.content).toBe('正文');
        expect(unchanged.revision).toBe(current.revision);
      },
    );

    it('finishes concurrent taxonomy changes, webpage saves, and CLI publication without stale metadata writes', async () => {
      const created = await fetch(`${base}/v1/articles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: '分类并发',
          description: '说明',
          content: '正文',
          topicName: '并发主题',
          tagNames: ['并发标签'],
        }),
      }).then((response) => response.json());
      const topic = (await fetch(`${base}/v1/topics`).then((response) => response.json()))[0];
      const tag = (await fetch(`${base}/v1/tags`).then((response) => response.json()))[0];
      const requests = [
        fetch(`${base}/v1/topics/${topic.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: '并发新主题' }),
          signal: AbortSignal.timeout(5000),
        }),
        fetch(`${base}/v1/tags/${tag.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: '并发新标签' }),
          signal: AbortSignal.timeout(5000),
        }),
        fetch(`${base}/v1/articles/${created.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', 'if-match': created.revision },
          body: JSON.stringify({ content: '并发新正文', topicId: topic.id }),
          signal: AbortSignal.timeout(5000),
        }),
        fetch(`${base}/v1/cli/articles/${created.id}/publish`, {
          method: 'POST',
          headers: { 'x-request-id': randomUUID(), 'if-match': created.revision },
          signal: AbortSignal.timeout(5000),
        }),
      ];
      const [renamedTopic, renamedTag, edited, published] = await Promise.all(requests);
      expect(renamedTopic.status).toBe(200);
      expect(renamedTag.status).toBe(200);
      expect([200, 409]).toContain(edited.status);
      expect([200, 409]).toContain(published.status);
      const current = await fetch(`${base}/v1/cli/articles/${created.id}`).then((response) =>
        response.json(),
      );
      expect(current.topic).toBe('并发新主题');
      expect(current.tags).toEqual(['并发新标签']);
      expect(current.revision).not.toBe(created.revision);
      const stale = await fetch(`${base}/v1/cli/articles/${created.id}/publish`, {
        method: 'POST',
        headers: { 'x-request-id': randomUUID(), 'if-match': created.revision },
      });
      expect(stale.status).toBe(409);
    });

    it.each(['title', 'content', 'description'])(
      'rejects publishing a whitespace-only %s through CLI and webpage without advancing revision',
      async (field) => {
        const response = await fetch(`${base}/v1/articles`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: '待发布',
            description: '说明',
            content: '正文',
            [field]: ' ',
          }),
        });
        expect(response.status).toBe(201);
        const article = await response.json();
        const cli = await fetch(`${base}/v1/cli/articles/${article.id}/publish`, {
          method: 'POST',
          headers: { 'x-request-id': randomUUID(), 'if-match': article.revision },
        });
        expect(cli.status).toBe(400);
        const webpage = await fetch(`${base}/v1/articles/${article.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', 'if-match': article.revision },
          body: JSON.stringify({ status: 'published' }),
        });
        expect(webpage.status).toBe(400);
        const current = await fetch(`${base}/v1/cli/articles/${article.id}`).then((result) =>
          result.json(),
        );
        expect(current.revision).toBe(article.revision);
        expect(current.status).toBe('draft');
      },
    );

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
