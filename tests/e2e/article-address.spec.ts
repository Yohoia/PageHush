import { expect, test } from '@playwright/test';
import { articleShortId } from '../../packages/shared/src/article-address';
import { tocArticle, tocFixtureResponse } from './fixtures/toc-article';

const id = '95ad948e-3101-45f4-8b5c-646c3b988251';
const shortId = articleShortId(id)!;
const canonicalPath = `/a/${shortId}`;
const legacySlug = '如何建立阅读习惯';

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/**', (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    const article = { ...tocArticle, id, shortId, slug: legacySlug };
    const data =
      path === '/v1/articles'
        ? [article]
        : path === `/v1/articles/${id}` || path === `/v1/articles/${legacySlug}`
          ? article
          : tocFixtureResponse(path);
    return route.fulfill({ json: data });
  });
});

test('card links, delayed handoff, refresh and return use the fixed short address', async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route(`**/v1/articles/${id}`, async (route) => {
    requested = true;
    await held;
    await route.fulfill({ json: { ...tocArticle, id, shortId, slug: legacySlug } });
  });
  await page.goto('/');
  const link = page.getByRole('link', { name: `进入文章：${tocArticle.title}` });
  await expect(link).toHaveAttribute('href', canonicalPath);
  await page
    .locator('.article-card-media')
    .first()
    .evaluate((image: HTMLImageElement) => image.decode());
  await link.click();
  await expect(page).toHaveURL(canonicalPath);
  await expect(page.getByLabel('文章标题')).toHaveValue(tocArticle.title);
  await expect.poll(() => requested).toBe(true);
  await expect(page.locator('html')).not.toHaveAttribute('data-article-transition');
  release();
  await expect(page.locator('.editor-page')).toHaveAttribute('aria-busy', 'false');
  await page.reload();
  await expect(page).toHaveURL(canonicalPath);
  await expect(page.getByLabel('文章标题')).toHaveValue(tocArticle.title);
  await page.goBack();
  await expect(page).toHaveURL('/');
  await expect(page.locator('.article-card')).toHaveCount(1);
});

test('old Chinese and UUID links replace the URL, preserving query, fragment and back history', async ({
  page,
}) => {
  for (const legacyIdentifier of [legacySlug, id]) {
    await page.goto('/');
    // A normal in-app history entry followed by canonical replacement.
    const pushedLength = await page.evaluate(
      (path) => {
        history.pushState(null, '', path);
        dispatchEvent(new PopStateEvent('popstate'));
        return history.length;
      },
      `/articles/${encodeURIComponent(legacyIdentifier)}?toc=off#notes`,
    );
    await expect(page).toHaveURL(`${canonicalPath}?toc=off#notes`);
    await expect(page.getByLabel('文章标题')).toHaveValue(tocArticle.title);
    expect(await page.evaluate(() => history.length)).toBe(pushedLength);
    await page.goBack();
    await expect(page).toHaveURL('/');
  }
});

test('saving a renamed article keeps its address and updating uses its UUID', async ({ page }) => {
  let savedTitle = tocArticle.title;
  await page.route(`**/v1/articles/${id}`, (route) => {
    if (route.request().method() === 'PATCH') savedTitle = route.request().postDataJSON().title;
    return route.fulfill({
      json: { ...tocArticle, id, shortId, slug: legacySlug, title: savedTitle },
    });
  });
  await page.goto(canonicalPath);
  await expect(page.getByRole('button', { name: '保存文章', exact: true })).toBeEnabled();
  await page.getByLabel('文章标题').fill('修改后的中文标题');
  await page.getByRole('button', { name: '保存文章', exact: true }).click();
  await expect.poll(() => savedTitle).toBe('修改后的中文标题');
  await expect(page).toHaveURL(canonicalPath);
  await page.reload();
  await expect(page.getByLabel('文章标题')).toHaveValue(savedTitle);
});

test('a newly saved article navigates to its short address', async ({ page }) => {
  let savedTitle = '';
  await page.route('**/v1/articles', (route) => {
    if (route.request().method() === 'POST') {
      savedTitle = route.request().postDataJSON().title;
      return route.fulfill({
        status: 201,
        json: { ...tocArticle, id, shortId, slug: legacySlug, title: savedTitle },
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/editor');
  await page.getByLabel('文章标题').fill('新建的中文文章');
  await page.getByRole('button', { name: '保存文章', exact: true }).click();
  await expect(page).toHaveURL(canonicalPath);
  expect(savedTitle).toBe('新建的中文文章');
});

test('editor images do not send the PageHush referrer to external publishers', async ({ page }) => {
  await page.route(`**/v1/articles/${id}`, (route) =>
    route.fulfill({
      json: {
        ...tocArticle,
        id,
        shortId,
        slug: legacySlug,
        content: '## 外链图片\n\n![微信公众号图片](https://example.com/image.png)',
      },
    }),
  );
  await page.goto(canonicalPath);
  await expect(page.getByLabel('正文编辑区')).toBeVisible();
  await expect(page.locator('.ProseMirror img')).toHaveAttribute(
    'referrerpolicy',
    'no-referrer',
  );
});

test('an invalid short address cannot become a new editable article', async ({ page }) => {
  const articleRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/v1/articles')) articleRequests.push(request.url());
  });
  await page.goto('/a/invalid');
  await expect(page.getByText('文章地址无效，请检查链接后重试')).toBeVisible();
  await expect(page.getByRole('button', { name: '保存文章', exact: true })).toBeDisabled();
  expect(articleRequests).toEqual([]);
});

test('changing a reading fragment preserves unsaved edits without refetching the article', async ({
  page,
}) => {
  let reads = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === `/v1/articles/${id}`) reads += 1;
  });
  await page.goto(canonicalPath);
  await expect(page.getByRole('button', { name: '保存文章', exact: true })).toBeEnabled();
  await page.getByLabel('文章标题').fill('尚未保存的修改');
  const before = reads;
  await page.evaluate(() => {
    history.pushState(history.state, '', '?toc=off#notes');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveURL(`${canonicalPath}?toc=off#notes`);
  await expect(page.getByLabel('文章标题')).toHaveValue('尚未保存的修改');
  expect(reads).toBe(before);
});
