import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const accessCode = readFileSync('.env', 'utf8')
  .match(/^E2E_ACCESS_CODE=(.+)$/m)?.[1]
  ?.trim();

if (!accessCode) throw new Error('E2E_ACCESS_CODE is required in the ignored local .env file.');

let sessionCookiePromise: Promise<{ name: string; value: string }> | undefined;

function getSharedSessionCookie() {
  sessionCookiePromise ??= fetch('http://127.0.0.1:8787/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessCode, remember: true }),
  }).then(async (response) => {
    if (!response.ok) throw new Error(`Unable to prepare E2E session: ${response.status}`);

    const setCookie = response.headers.get('set-cookie');
    const [pair] = setCookie?.split(';') ?? [];
    const [name, value] = pair?.split('=') ?? [];
    if (!name || !value) throw new Error('E2E login did not return a session cookie');
    return { name, value };
  });

  return sessionCookiePromise;
}

async function fillAccessCode(page: Page, code: string) {
  const keys = page.locator('.login-key-input');
  await expect(keys).toHaveCount(6);
  for (let index = 0; index < code.length; index += 1) {
    await keys.nth(index).fill(code[index]!);
  }
}

async function login(page: Page) {
  const cookie = await getSharedSessionCookie();
  await page.context().addCookies([{ ...cookie, url: 'http://127.0.0.1:5173' }]);
}

test('protects PageHush with an access code and a server session', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login\?redirect=%2F/);
  await expect(page.getByRole('button', { name: '解锁页息' })).toBeVisible();

  const unauthenticatedResponse = await page.request.get('/v1/articles');
  expect(unauthenticatedResponse.status()).toBe(401);

  await fillAccessCode(page, accessCode === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: '解锁页息' }).click();
  await expect(page.getByText('访问码不正确，请重新输入。')).toBeVisible();

  await fillAccessCode(page, accessCode);
  await page.getByRole('button', { name: '解锁页息' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('.article-loading')).toHaveCount(0);
  await expect(page.locator('.article-card')).toHaveCount(0);

  const authenticatedResponse = await page.request.get('/v1/articles');
  expect(authenticatedResponse.status()).toBe(200);
  expect(await authenticatedResponse.json()).toEqual([]);

  await page.getByRole('button', { name: '退出' }).click();
  await expect(page).toHaveURL('/login');
  const loggedOutResponse = await page.request.get('/v1/articles');
  expect(loggedOutResponse.status()).toBe(401);
});

test('opens a blank editor with only the 学习 topic and no tags', async ({ page }) => {
  await login(page);
  await page.goto('/editor');
  await expect(page.getByRole('link', { name: '页息 PageHush 首页' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /学习 · TOPIC/ })).toBeVisible();
  await expect(page.getByLabel('文章标题')).toHaveValue('');
  await expect(page.getByText('0 字', { exact: true })).toBeVisible();
  await expect(page.locator('.editor-tag')).toHaveCount(0);
  await expect(page.getByLabel('正文编辑区')).toHaveText('');
  await expect(page.getByLabel('正文编辑区').locator('img')).toHaveCount(0);

  await page.getByRole('button', { name: /学习 · TOPIC/ }).click();
  await expect(page.getByRole('menuitem', { name: '学习', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /删除主题/ })).toHaveCount(1);
  await expect(page.getByRole('menuitem', { name: '删除主题 学习' })).toBeDisabled();
  await page.getByRole('menuitem', { name: '学习', exact: true }).click();

  for (const tag of ['测试', 'Markdown', '第三个']) {
    await page.getByRole('button', { name: '标签', exact: true }).click();
    await page.getByLabel('新增标签').fill(tag);
    await page.keyboard.press('Enter');
    await expect(page.getByText(`#${tag}`, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: '标签', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '移除标签 Markdown' }).click();
  await expect(page.getByText('#Markdown')).toHaveCount(0);

  const toolbar = page.getByRole('toolbar');
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveCSS('flex-wrap', 'nowrap');
  await expect((await toolbar.boundingBox())?.height ?? 0).toBeLessThanOrEqual(40);
  await expect(toolbar.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Bold' })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Search and replace' })).toBeVisible();
});

test('editor fills the screen and enters Motion fullscreen mode', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.route('**/v1/articles/fullscreen-test', (route) =>
    route.fulfill({
      status: 200,
      json: {
        id: 'fullscreen-test',
        slug: 'fullscreen-test',
        title: '全屏编辑测试',
        content: '',
        format: 'md',
        topic: '学习',
        tags: [],
        cover: null,
        coverAssetId: null,
        publishedAt: '2026-10-08T00:00:00.000Z',
      },
    }),
  );
  await page.goto('/articles/fullscreen-test');
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '返回上一页' })).toBeVisible();
  await expect(page.getByLabel('文章标题')).toHaveValue('全屏编辑测试');
  const initialToolbarTop = await page
    .getByRole('toolbar')
    .evaluate((toolbar) => toolbar.getBoundingClientRect().top);
  await page.getByRole('button', { name: '进入全屏' }).click();

  await expect(page.getByRole('button', { name: /学习 · TOPIC/ })).toHaveCount(0);
  await expect(page.locator('.editor-metadata')).toHaveCount(0);
  await expect(page.getByLabel('文章标题')).toHaveValue('全屏编辑测试');
  await expect(page.getByLabel('文章标题')).toHaveCSS('font-size', '28px');
  await expect(page.getByRole('button', { name: '退出全屏' })).toBeVisible();
  await expect
    .poll(() =>
      page.getByRole('toolbar').evaluate((toolbar) => toolbar.getBoundingClientRect().top),
    )
    .toBeLessThan(20);
  expect(initialToolbarTop).toBeGreaterThan(20);
  expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);

  await page.getByRole('button', { name: '退出全屏' }).click();
  await expect(page.getByRole('button', { name: /学习 · TOPIC/ })).toBeVisible();
  await expect(page.getByLabel('文章标题')).toHaveCSS('font-size', '32px');
});

test('official Tiptap toolbar commands update active state', async ({ page }) => {
  await login(page);
  await page.goto('/editor');
  const editor = page.getByLabel('正文编辑区');
  await editor.click();
  await page.keyboard.type('Toolbar test');
  const blockquote = page.getByRole('toolbar').getByRole('button', { name: 'Blockquote' });
  await expect(blockquote).toBeEnabled();
  await blockquote.click();
  await expect(blockquote).toHaveAttribute('aria-pressed', 'true');
  await blockquote.click();
  await expect(blockquote).toHaveAttribute('aria-pressed', 'false');
});

test('opens an empty article library with the 学习 filter', async ({ page }) => {
  await login(page);
  await page.goto('/');
  await expect(page.getByRole('navigation').getByRole('link', { name: '写作' })).toBeVisible();
  await expect(page.locator('.article-loading')).toHaveCount(0);
  await expect(page.locator('.article-card')).toHaveCount(0);
  await expect(page.locator('.article-count')).toHaveText('00篇文章');
  await expect(page.locator('.article-topic-filter')).toHaveCount(2);
  await page.getByRole('button', { name: '学习', exact: true }).click();
  await expect(page).toHaveURL('/?topic=学习');
  await expect(page.locator('.article-card')).toHaveCount(0);
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await expect(page).toHaveURL('/');

  await page.route('**/v1/articles', (route) =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } }),
  );
  await page.reload();
  await expect(page.locator('.article-loading')).toHaveCount(0);
  await expect(page.locator('.article-card')).toHaveCount(0);
});

test('keeps project content widths predictable across routes and viewports', async ({ page }) => {
  await login(page);
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/editor');
    const editorWidth = await page
      .locator('.page-content')
      .first()
      .evaluate((node) => Math.round(node.getBoundingClientRect().width));
    await page.goto('/');
    const libraryWidth = await page
      .locator('.page-wide')
      .first()
      .evaluate((node) => Math.round(node.getBoundingClientRect().width));
    expect(editorWidth).toBeGreaterThan(0);
    expect(libraryWidth).toBeGreaterThan(0);
    if (viewport.width === 1440) {
      expect(editorWidth).toBe(760);
      expect(libraryWidth).toBe(1320);
    }
  }
  await page.goto('/settings');
  await expect(page).toHaveURL('/');
  await expect(page.locator('.article-card')).toHaveCount(0);
});

test('opening and adding an inline tag keeps the metadata divider stable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto('/editor');
  await page.getByRole('button', { name: /学习 · TOPIC/ }).waitFor();
  const dividerTop = () =>
    page
      .locator('.page-content > .bg-line')
      .evaluate((node) => Math.round(node.getBoundingClientRect().top));
  const initialTop = await dividerTop();
  await page.getByRole('button', { name: '标签', exact: true }).click();
  const openTop = await dividerTop();
  await page.getByLabel('新增标签').fill('测试');
  await page.keyboard.press('Enter');
  await page.getByText('#测试').waitFor();
  expect(openTop).toBeLessThanOrEqual(initialTop);
  expect(await dividerTop()).toBe(openTop);
});

test('uploads and previews an article cover without creating persistent test data', async ({
  page,
}) => {
  await login(page);
  await page.route('**/v1/assets', (route) =>
    route.fulfill({
      status: 201,
      json: { id: 'test-cover', url: '/brand/logo-128.png', kind: 'cover', status: 'ready' },
    }),
  );
  await page.goto('/editor');
  await expect(page.locator('.editor-cover-default-note')).toContainText('默认封面 · 点击上传');
  await page.locator('.editor-cover-input').setInputFiles({
    name: 'test-cover.png',
    mimeType: 'image/png',
    buffer: readFileSync('packages/web/public/brand/logo-128.png'),
  });
  await expect(page.locator('.editor-cover')).toBeVisible();
  await expect(page.locator('.editor-cover img')).toHaveAttribute('src', '/brand/logo-128.png');
  await expect(page.locator('.editor-cover-action')).toContainText('更换封面');
});
