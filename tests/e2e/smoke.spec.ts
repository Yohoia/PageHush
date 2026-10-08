import { join } from 'node:path';
import { expect, test } from '@playwright/test';

test('shows PageHush metadata around the official Tiptap Simple Editor', async ({ page }) => {
  await page.goto('/editor');
  await expect(page.getByRole('link', { name: '页息 PageHush 首页' })).toHaveCount(0);
  await expect(page.getByText('随笔 · ESSAY')).toBeVisible();
  await expect(page.getByLabel('文章标题')).toHaveValue('把日子，写慢一点');
  await expect(page.getByText('2026-10-06')).toBeVisible();
  await expect(page.getByText(/\d+ 字/)).toBeVisible();
  await expect(page.getByText('#写作')).toBeVisible();
  await expect(page.getByText('#Markdown')).toBeVisible();

  await page.getByRole('button', { name: /随笔 · ESSAY/ }).click();
  await page.getByRole('menuitem', { name: '生活', exact: true }).click();
  await expect(page.getByRole('button', { name: /生活 · ESSAY/ })).toBeVisible();

  await expect(page.locator('.editor-category-button')).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.editor-tag').first()).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.editor-tag').first().locator('button')).toHaveCSS('opacity', '0');

  const categoryButton = page.getByRole('button', { name: /生活 · ESSAY/ });
  await expect(categoryButton.locator('svg')).toHaveCSS('opacity', '0');
  await expect(categoryButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  await categoryButton.hover();
  await expect(categoryButton.locator('svg')).toHaveCSS('opacity', '1');
  await expect(categoryButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  const firstTag = page.locator('.editor-tag').first();
  await firstTag.hover();
  await expect(firstTag.locator('button')).toHaveCSS('opacity', '1');
  await expect(firstTag).toHaveCSS('background-color', 'rgba(238, 238, 230, 0.55)');
  await expect(firstTag).toHaveCSS('border-top-width', '0px');

  await page.getByRole('button', { name: '移除标签 Markdown' }).click();
  await expect(page.getByText('#Markdown')).toHaveCount(0);

  await page.getByRole('button', { name: '标签', exact: true }).click();
  await page.getByLabel('新增标签').fill('旅行');
  await page.keyboard.press('Enter');
  await expect(page.getByText('#旅行')).toBeVisible();
  await expect(page.getByLabel('新增标签')).toHaveCount(0);

  await page.getByRole('button', { name: '标签', exact: true }).click();
  await page.getByLabel('新增标签').fill('第三个');
  await page.keyboard.press('Enter');
  await expect(page.getByText('#第三个')).toBeVisible();
  await expect(page.getByRole('button', { name: '标签', exact: true })).toHaveCount(0);

  const toolbar = page.getByRole('toolbar');
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveCSS('flex-wrap', 'nowrap');
  await expect(toolbar).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect((await toolbar.boundingBox())?.height ?? 0).toBeLessThanOrEqual(40);
  await expect(toolbar.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Bold' })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Search and replace' })).toBeVisible();
  await expect(toolbar.locator('svg').first()).toBeVisible();

  const editor = page.getByLabel('正文编辑区');
  await expect(editor.getByText('从一件小事开始')).toBeVisible();
});

test('editor fills the screen and enters Motion fullscreen mode', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/articles/walking-gently');
  await expect(page.getByRole('link', { name: '页息 PageHush 首页' })).toHaveCount(0);
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '返回上一页' })).toBeVisible();
  await expect(page.locator('.editor-back-button svg')).toBeVisible();
  await expect(page.getByRole('button', { name: /随笔 · ESSAY/ })).toBeVisible();
  await expect(page.getByLabel('文章标题')).toBeVisible();

  const initialToolbarTop = await page
    .getByRole('toolbar')
    .evaluate((toolbar) => toolbar.getBoundingClientRect().top);
  await expect(page.locator('.lucide-maximize')).toBeVisible();
  await page.getByRole('button', { name: '进入全屏' }).click();

  await expect(page.getByRole('button', { name: /随笔 · ESSAY/ })).toHaveCount(0);
  await expect(page.locator('.editor-metadata')).toHaveCount(0);
  const fullscreenTitle = page.getByLabel('文章标题');
  await expect(fullscreenTitle).toBeVisible();
  await expect(fullscreenTitle).toHaveValue('一个人走路时，世界会悄悄变得温柔');
  await expect(fullscreenTitle).toHaveCSS('font-size', '28px');
  await expect(page.getByRole('heading', { name: '一个人走路时，世界会悄悄变得温柔' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: '退出全屏' })).toBeVisible();

  await expect
    .poll(
      async () =>
        page.getByRole('toolbar').evaluate((toolbar) => toolbar.getBoundingClientRect().top),
      { timeout: 3_000 },
    )
    .toBeLessThan(20);
  expect(initialToolbarTop).toBeGreaterThan(20);
  expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expect(page.locator('.lucide-minimize')).toBeVisible();

  await page.getByRole('button', { name: '退出全屏' }).click();
  await expect(page.getByRole('button', { name: /随笔 · ESSAY/ })).toBeVisible();
  await expect(page.getByLabel('文章标题')).toHaveCSS('font-size', '32px');
  expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
});

test('official Tiptap toolbar commands update active state', async ({ page }) => {
  await page.goto('/editor');
  const editor = page.getByLabel('正文编辑区');
  await editor.click();
  await page.keyboard.press('ArrowRight');

  const blockquote = page.getByRole('toolbar').getByRole('button', { name: 'Blockquote' });
  await expect(blockquote).toBeEnabled();
  await blockquote.click();
  await expect(blockquote).toHaveAttribute('aria-pressed', 'true');
  await blockquote.click();
  await expect(blockquote).toHaveAttribute('aria-pressed', 'false');
});

test('opens the article library by default', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation').getByRole('link', { name: '写作' })).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link', { name: '设置' })).toHaveCount(0);
  await expect(page.getByRole('navigation').getByRole('link', { name: '文稿' })).toHaveCount(0);
  await expect(page.locator('.article-card')).toHaveCount(8);
  await expect(
    page.getByRole('heading', { name: '一个人走路时，世界会悄悄变得温柔' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '在路上：关于旅行与自我的对话' })).toBeVisible();
  await expect(page.getByLabel('搜索文稿')).toHaveCount(0);
  await expect(page.locator('.article-card-status').first()).toHaveText('草稿');
  await expect(page.locator('.article-card-tags').first()).toBeVisible();
  await expect(page.locator('.article-card-tags').first().locator('span')).toHaveCount(3);
  await expect(page.locator('.article-card-tags').filter({ hasText: /^\+\d+$/ })).toHaveCount(0);
  await expect(page.locator('.article-card-arrow svg').first()).toBeVisible();

  const firstCard = page.locator('.article-card').first();
  await firstCard.hover();
  await expect(page.locator('.article-card-arrow').first()).toHaveCSS(
    'background-color',
    'rgb(236, 233, 224)',
  );

  const images = page.locator('.article-card-media');
  await expect(images.first()).toBeVisible();
  for (let index = 0; index < 8; index += 1) {
    const loaded = await images
      .nth(index)
      .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0);
    expect(loaded).toBe(true);
  }

  const cardSize = await page.locator('.article-card').evaluateAll((cards) => {
    const rectangles = cards.map((card) => {
      const rectangle = card.getBoundingClientRect();
      return { width: Math.round(rectangle.width), height: Math.round(rectangle.height) };
    });

    return {
      widths: [...new Set(rectangles.map((rectangle) => rectangle.width))],
      heights: [...new Set(rectangles.map((rectangle) => rectangle.height))],
    };
  });
  const cardColumns = await page
    .locator('.article-grid')
    .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length);
  const cardSurface = await page
    .locator('.article-card')
    .first()
    .evaluate((card) => {
      const style = getComputedStyle(card);
      return {
        borderTopWidth: style.borderTopWidth,
        borderRightWidth: style.borderRightWidth,
        borderBottomWidth: style.borderBottomWidth,
        gap: getComputedStyle(card.closest('.article-grid') as Element).gap,
        boxShadow: style.boxShadow,
      };
    });

  expect(cardSurface.borderTopWidth).toBe('0px');
  expect(cardSurface.borderRightWidth).toBe('0px');
  expect(cardSurface.borderBottomWidth).toBe('0px');
  expect(cardSurface.gap).toBe('20px');
  expect(cardSurface.boxShadow).not.toBe('none');

  const textClamps = await page
    .locator('.article-card')
    .first()
    .evaluate((card) => {
      const title = card.querySelector('.article-card-title') as Element;
      const excerpt = card.querySelector('.article-card-excerpt') as Element;
      const image = card.querySelector('.article-card-media') as Element;

      return {
        imageAspectRatio: getComputedStyle(image).aspectRatio,
        titleLineClamp: getComputedStyle(title).webkitLineClamp,
        excerptLineClamp: getComputedStyle(excerpt).webkitLineClamp,
      };
    });

  expect(textClamps.imageAspectRatio).toBe('16 / 9');
  expect(textClamps.titleLineClamp).toBe('2');
  expect(textClamps.excerptLineClamp).toBe('2');

  const tagGeometry = await page.locator('.article-card').evaluateAll((cards) => {
    const geometry = cards.map((card) => {
      const excerpt = (
        card.querySelector('.article-card-excerpt') as Element
      ).getBoundingClientRect();
      const tags = (card.querySelector('.article-card-tags') as Element).getBoundingClientRect();
      const cardBox = card.getBoundingClientRect();
      return {
        excerptToTags: Math.round(tags.top - excerpt.bottom),
        tagOffsetFromCardTop: Math.round(tags.top - cardBox.top),
      };
    });

    return {
      excerptToTags: [...new Set(geometry.map((item) => item.excerptToTags))],
      tagOffsets: [...new Set(geometry.map((item) => item.tagOffsetFromCardTop))],
    };
  });

  expect(tagGeometry.excerptToTags).toEqual([8]);
  expect(tagGeometry.tagOffsets).toHaveLength(1);

  expect(cardColumns).toBe(4);
  expect(cardSize.widths).toHaveLength(1);
  expect(cardSize.heights).toHaveLength(1);

  await page.getByRole('button', { name: '生活' }).click();
  await expect(page.locator('.article-card')).toHaveCount(2);
  await expect(page).toHaveURL('/?category=生活');
  await page.getByRole('button', { name: '全部' }).click();
  await expect(page.locator('.article-card')).toHaveCount(8);

  await page.getByRole('link', { name: '进入文章：一个人走路时，世界会悄悄变得温柔' }).click();
  await expect(page).toHaveURL('/articles/walking-gently');
  await page.getByRole('button', { name: '返回上一页' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('.article-card')).toHaveCount(8);

  await page.mouse.wheel(0, 500);
  await page.getByLabel('新建文章').waitFor();
  await page.getByLabel('新建文章').click();
  await expect(page).toHaveURL('/editor');
  await expect(page.getByLabel('文章标题')).toBeVisible();
});

test('keeps project content widths predictable across routes and viewports', async ({ page }) => {
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
  await expect(page.locator('.article-card')).toHaveCount(8);
});

test('opening and adding an inline tag keeps the metadata divider stable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/editor');
  await page.getByRole('button', { name: /随笔 · ESSAY/ }).waitFor();

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
  const addedTop = await dividerTop();

  expect(openTop).toBeLessThanOrEqual(initialTop);
  expect(addedTop).toBe(openTop);
});

test('uploads and previews an article cover', async ({ page }) => {
  await page.goto('/editor');
  const placeholder = page.locator('.editor-cover-empty');
  await expect(placeholder).toBeVisible();
  await expect(placeholder).toContainText('上传封面');

  await page
    .locator('.editor-cover-input')
    .setInputFiles(join(process.cwd(), 'packages/web/public/articles/article-01.jpg'));

  const cover = page.locator('.editor-cover');
  await expect(cover).toBeVisible();
  await expect(cover.locator('img')).toBeVisible();
  await expect(page.locator('.editor-cover-action')).toContainText('更换封面');
});
