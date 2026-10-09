import { expect, test } from '@playwright/test';
import { tocArticle, tocFixtureResponse, tocHeadings } from './fixtures/toc-article';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('**/v1/**', (route) =>
    route.fulfill({ json: tocFixtureResponse(new URL(route.request().url()).pathname) }),
  );
  await page.goto('/articles/toc-validation');
  await expect(page.getByLabel('文章标题')).toHaveValue(tocArticle.title);
  await expect(page.locator('.editor-soft-toc-list button')).toHaveCount(tocHeadings.length);
});

test('opens from any part of the line, follows a chapter and returns to the top', async ({
  page,
}) => {
  const trigger = page.locator('.editor-soft-toc-trigger');
  const nav = page.getByRole('navigation', { name: '文章目录' });
  const list = page.locator('.editor-soft-toc-list');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(list).toHaveAttribute('inert', '');
  const bounds = await trigger.boundingBox();
  if (!bounds) throw new Error('Missing line trigger');
  for (const ratio of [0.12, 0.5, 0.88]) {
    await page.mouse.move(bounds.x + 28, bounds.y + bounds.height * ratio);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(list).toHaveCSS('opacity', '1');
    const track = await page.locator('.editor-soft-toc-track').boundingBox();
    if (!track) throw new Error('Missing soft line');
    const expectedY = Math.max(
      16,
      Math.min(track.height - 16, bounds.y + bounds.height * ratio - track.y),
    );
    await expect
      .poll(async () =>
        Math.abs(Number(await page.locator('.soft-toc-cursor').getAttribute('cy')) - expectedY),
      )
      .toBeLessThan(2);
    await page.mouse.move(900, 160);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(list).toHaveCSS('opacity', '0');
  }
  await trigger.hover();
  await nav.getByRole('button', { name: tocHeadings[4], exact: true }).click();
  await expect(nav.getByRole('button', { name: tocHeadings[4], exact: true })).toHaveAttribute(
    'aria-current',
    'location',
  );
  await expect
    .poll(() =>
      page
        .getByRole('heading', { name: tocHeadings[4], exact: true })
        .evaluate((node) => Math.round(node.getBoundingClientRect().top)),
    )
    .toBeLessThan(200);
  await page.locator('.editor-soft-toc-top').hover();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: '返回顶部', exact: true })).toBeEnabled();
  await expect
    .poll(async () =>
      Number(
        await page.getByRole('progressbar', { name: '阅读进度' }).getAttribute('aria-valuenow'),
      ),
    )
    .toBeGreaterThan(0);
  expect(
    await page
      .locator('.editor-soft-toc-line')
      .evaluate(
        (svg) =>
          svg.querySelector('path')?.getAttribute('d') ===
          svg.querySelector('.soft-toc-read-path')?.getAttribute('d'),
      ),
  ).toBe(true);
  const readPath = page.locator('.soft-toc-read-path');
  await expect
    .poll(async () => {
      const progress = Number(await nav.getByRole('progressbar').getAttribute('aria-valuenow'));
      return (
        Number(await readPath.evaluate((node) => (node as SVGElement).style.strokeDashoffset)) +
        progress
      );
    })
    .toBe(100);
  await page.screenshot({ path: 'design/article-toc/evidence/implemented/desktop-progress.png' });
  await page.getByRole('button', { name: '返回顶部', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole('progressbar', { name: '阅读进度' })).toHaveAttribute(
    'aria-valuenow',
    '0',
  );
  await expect(page.getByRole('button', { name: '返回顶部', exact: true })).toBeDisabled();
  await expect(readPath).toHaveCSS('stroke-dashoffset', '100px');
  await expect(readPath).toHaveCSS('opacity', '0');
  await page.keyboard.press('End');
  await expect(page.getByRole('progressbar', { name: '阅读进度' })).toHaveAttribute(
    'aria-valuenow',
    '100',
  );
});

test('keeps empty articles quiet and provides reading controls without headings', async ({
  page,
}) => {
  await page.route('**/v1/articles/empty-toc', (route) =>
    route.fulfill({ json: { ...tocArticle, content: '' } }),
  );
  await page.goto('/articles/empty-toc');
  await expect(page.getByLabel('正文编辑区')).toHaveText('');
  await expect(page.locator('.editor-soft-toc')).toHaveCount(0);

  await page.route('**/v1/articles/no-headings', (route) =>
    route.fulfill({
      json: {
        ...tocArticle,
        content: Array.from({ length: 30 }, () => '这一页只有正文，没有章节标题。'.repeat(6)).join(
          '\n\n',
        ),
      },
    }),
  );
  await page.goto('/articles/no-headings');
  await expect(page.getByLabel('正文编辑区')).toContainText('这一页只有正文');
  await page.keyboard.press('End');
  await expect(page.getByRole('button', { name: '返回顶部', exact: true })).toBeEnabled();
  await expect(page.locator('.editor-soft-toc-trigger')).toHaveCount(0);
  await page.getByRole('button', { name: '返回顶部', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('.editor-soft-toc')).toHaveCount(0);
});

test('updates headings without stale anchors and restores after fullscreen', async ({ page }) => {
  const heading = page.getByLabel('正文编辑区').locator('h2').first();
  await heading.click();
  await page.keyboard.press('Home');
  await page.keyboard.insertText('新章节：');
  await expect(page.locator('.editor-soft-toc-list')).toContainText('新章节：从一件小事开始');
  const ids = await page
    .locator('.editor-soft-toc-list button')
    .evaluateAll((links) => links.map((link) => link.getAttribute('data-heading-id')));
  expect(new Set(ids).size).toBe(ids.length);
  await page.getByRole('button', { name: '进入全屏' }).click();
  await expect(page.locator('.editor-soft-toc')).toHaveCount(0);
  await page.getByRole('button', { name: '退出全屏' }).click();
  await expect(page.locator('.editor-soft-toc-list button')).toHaveCount(tocHeadings.length);
  await page.locator('.editor-soft-toc-trigger').focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator('.editor-soft-toc-trigger')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('.editor-soft-toc-trigger')).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(page.locator('.editor-soft-toc-trigger')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(page.locator('.editor-soft-toc-list button').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.editor-soft-toc-trigger')).toBeFocused();
  await expect(page.locator('.editor-soft-toc-trigger')).toHaveAttribute('aria-expanded', 'false');
});

test('supports touch, long lists and reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  const trigger = page.getByRole('button', { name: '展开文章目录', exact: true });
  await trigger.click();
  await expect(page.locator('.compact-toc-panel')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'design/article-toc/evidence/implemented/mobile-dark.png' });
  await page.locator('.compact-toc-panel ol button').nth(5).click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('button', { name: '返回顶部', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '返回顶部', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.route('**/v1/articles/long-toc', (route) =>
    route.fulfill({
      json: {
        ...tocArticle,
        content: Array.from(
          { length: 30 },
          (_, i) => `## 第 ${i + 1} 章：${'中文长标题'.repeat(6)}\n\n正文内容。`,
        ).join('\n\n'),
      },
    }),
  );
  await page.goto('/articles/long-toc');
  await expect(page.locator('.compact-toc-panel ol button')).toHaveCount(30);
  await page.getByRole('button', { name: '展开文章目录', exact: true }).click();
  const list = page.locator('.compact-toc-panel ol');
  expect(await list.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  await page
    .getByRole('navigation', { name: '文章目录' })
    .locator('.compact-toc-panel ol button')
    .last()
    .click();
  await expect(page.locator('.compact-toc-entry')).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
