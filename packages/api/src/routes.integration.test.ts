import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestServer, TEST_ACCESS_CODE } from './test-support/integration.js';

let server: Awaited<ReturnType<typeof buildTestServer>>;

beforeEach(async () => {
  server = await buildTestServer();
});

afterEach(async () => {
  await server.close();
});

async function login() {
  const response = await server.app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { accessCode: TEST_ACCESS_CODE, remember: true },
  });
  expect(response.statusCode).toBe(201);
  const setCookie = response.headers['set-cookie'];
  return (Array.isArray(setCookie) ? setCookie[0] : setCookie)!.split(';')[0]!;
}

describe('authentication', () => {
  it('rejects invalid access codes and protects content routes', async () => {
    const wrong = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { accessCode: 'wrong-code' },
    });
    expect(wrong.statusCode).toBe(401);

    const unauthenticated = await server.app.inject({ method: 'GET', url: '/v1/articles' });
    expect(unauthenticated.statusCode).toBe(401);
  });

  it('logs in, exposes the session, and logs out', async () => {
    const cookie = await login();

    const session = await server.app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: { cookie },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().authenticated).toBe(true);

    const logout = await server.app.inject({
      method: 'DELETE',
      url: '/v1/auth/logout',
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(204);

    const afterLogout = await server.app.inject({
      method: 'GET',
      url: '/v1/articles',
      headers: { cookie },
    });
    expect(afterLogout.statusCode).toBe(401);
  });
});

describe('articles', () => {
  it('creates, lists without bodies, and reads back by id and slug', async () => {
    const cookie = await login();

    const created = await server.app.inject({
      method: 'POST',
      url: '/v1/articles',
      headers: { cookie },
      payload: {
        title: '第一篇文章',
        content: '这是正文，包含足够内容用于阅读时长估算。',
        topicName: '学习',
        tagNames: ['写作'],
      },
    });
    expect(created.statusCode).toBe(201);
    const article = created.json();
    expect(article.slug).toBe('第一篇文章');
    expect(article.topic).toBe('学习');
    expect(article.tags).toEqual(['写作']);

    const list = await server.app.inject({
      method: 'GET',
      url: '/v1/articles',
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    const items = list.json();
    expect(items).toHaveLength(1);
    expect(items[0].content).toBeUndefined();
    expect(items[0].readingTimeMinutes).toBeGreaterThanOrEqual(1);

    const byId = await server.app.inject({
      method: 'GET',
      url: `/v1/articles/${article.id}`,
      headers: { cookie },
    });
    expect(byId.statusCode).toBe(200);
    expect(byId.json().content).toContain('正文');

    const bySlug = await server.app.inject({
      method: 'GET',
      url: `/v1/articles/${encodeURIComponent(article.slug)}`,
      headers: { cookie },
    });
    expect(bySlug.statusCode).toBe(200);
  });

  it('rejects a missing referenced asset before creating the article', async () => {
    const cookie = await login();
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/articles',
      headers: { cookie },
      // A syntactically valid but nonexistent asset id triggers an FK violation,
      // which previously escaped as a raw database error message.
      payload: {
        title: '触发内部错误',
        coverAssetId: '00000000-0000-4000-8000-000000000000',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'asset_not_ready' });
    expect(response.body).not.toContain('foreign key');
  });

  it('rejects malformed source URLs', async () => {
    const cookie = await login();
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/articles',
      headers: { cookie },
      payload: { title: '坏链接', sourceUrl: 'not-a-url' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_source_url');
  });

  it('frees the slug after soft deletion', async () => {
    const cookie = await login();

    const first = await server.app.inject({
      method: 'POST',
      url: '/v1/articles',
      headers: { cookie },
      payload: { title: '重复标题', slug: 'reused-slug' },
    });
    expect(first.statusCode).toBe(201);

    const remove = await server.app.inject({
      method: 'DELETE',
      url: '/v1/articles/reused-slug',
      headers: { cookie, 'if-match': first.json().revision },
    });
    expect(remove.statusCode).toBe(204);

    const second = await server.app.inject({
      method: 'POST',
      url: '/v1/articles',
      headers: { cookie },
      payload: { title: '重复标题', slug: 'reused-slug' },
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().slug).toBe('reused-slug');
  });

  it('treats percent signs in search as literals', async () => {
    const cookie = await login();
    for (const title of ['Alpha', 'Beta']) {
      const response = await server.app.inject({
        method: 'POST',
        url: '/v1/articles',
        headers: { cookie },
        payload: { title },
      });
      expect(response.statusCode).toBe(201);
    }

    const search = await server.app.inject({
      method: 'GET',
      url: '/v1/articles?q=100%25',
      headers: { cookie },
    });
    expect(search.statusCode).toBe(200);
    expect(search.json()).toHaveLength(0);
  });
});

describe('taxonomy', () => {
  it('rejects whitespace-only names', async () => {
    const cookie = await login();

    const topic = await server.app.inject({
      method: 'POST',
      url: '/v1/topics',
      headers: { cookie },
      payload: { name: '   ' },
    });
    expect(topic.statusCode).toBe(400);
    expect(topic.json().error).toBe('name_required');

    const tag = await server.app.inject({
      method: 'POST',
      url: '/v1/tags',
      headers: { cookie },
      payload: { name: ' ' },
    });
    expect(tag.statusCode).toBe(400);
  });

  it('enforces case-insensitive uniqueness', async () => {
    const cookie = await login();

    const first = await server.app.inject({
      method: 'POST',
      url: '/v1/tags',
      headers: { cookie },
      payload: { name: 'python' },
    });
    expect(first.statusCode).toBe(201);

    const duplicate = await server.app.inject({
      method: 'POST',
      url: '/v1/tags',
      headers: { cookie },
      payload: { name: 'Python' },
    });
    expect(duplicate.statusCode).toBe(409);
  });

  it('counts only live articles and reports missing deletes', async () => {
    const cookie = await login();

    const article = await server.app.inject({
      method: 'POST',
      url: '/v1/articles',
      headers: { cookie },
      payload: { title: '计数文章', topicName: '生活', tagNames: ['日常'] },
    });
    expect(article.statusCode).toBe(201);

    const tagsBefore = await server.app.inject({
      method: 'GET',
      url: '/v1/tags',
      headers: { cookie },
    });
    expect(tagsBefore.json()[0].articleCount).toBe(1);

    const remove = await server.app.inject({
      method: 'DELETE',
      url: `/v1/articles/${article.json().id}`,
      headers: { cookie, 'if-match': article.json().revision },
    });
    expect(remove.statusCode).toBe(204);

    const tagsAfter = await server.app.inject({
      method: 'GET',
      url: '/v1/tags',
      headers: { cookie },
    });
    expect(tagsAfter.json()[0].articleCount).toBe(0);

    const missing = await server.app.inject({
      method: 'DELETE',
      url: '/v1/tags/00000000-0000-4000-8000-000000000000',
      headers: { cookie },
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe('shared article revisions', () => {
  it('requires a current revision for web updates and refuses a stale delete', async () => {
    const cookie = await login();
    const created = await server.app.inject({
      method: 'POST',
      url: '/v1/articles',
      headers: { cookie },
      payload: { title: '版本保护', description: '描述', content: '正文' },
    });
    const article = created.json();
    const missing = await server.app.inject({
      method: 'PATCH',
      url: `/v1/articles/${article.id}`,
      headers: { cookie },
      payload: { title: '无条件写入' },
    });
    expect(missing.statusCode).toBe(428);
    const updated = await server.app.inject({
      method: 'PATCH',
      url: `/v1/articles/${article.id}`,
      headers: { cookie, 'if-match': article.revision },
      payload: { title: '新标题' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().revision).not.toBe(article.revision);
    const stale = await server.app.inject({
      method: 'DELETE',
      url: `/v1/articles/${article.id}`,
      headers: { cookie, 'if-match': article.revision },
    });
    expect(stale.statusCode).toBe(409);
    const detail = await server.app.inject({
      method: 'GET',
      url: `/v1/articles/${article.id}`,
      headers: { cookie },
    });
    expect(detail.json().title).toBe('新标题');
  });
});
