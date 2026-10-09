import { expect, test } from '@playwright/test';
import { tocArticle, tocFixtureResponse, tocHeadings } from './fixtures/toc-article';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/v1/**', (route) =>
    route.fulfill({ json: tocFixtureResponse(new URL(route.request().url()).pathname) }),
  );
});

for (const variant of ['edge', 'footer', 'scrub'] as const) {
  test(`${variant}: gestures, chapters, progress and return work at narrow widths`, async ({
    page,
  }) => {
    await page.goto(`/articles/toc-validation?tocCompact=${variant}`);
    const nav = page.locator(`.compact-toc-${variant}`);
    const entry = nav.locator('.compact-toc-entry');
    await expect(nav.locator('ol button')).toHaveCount(tocHeadings.length);
    await expect(nav).toBeVisible();
    await expect(page.locator('.editor-soft-toc')).toBeHidden();
    await expect(entry).toHaveAttribute('aria-expanded', 'false');
    await expect(nav.locator('.compact-toc-panel')).toHaveAttribute('inert', '');

    if (variant === 'scrub') {
      const range = nav.getByRole('slider', { name: '拖动切换章节' });
      const box = await range.boundingBox();
      if (!box) throw new Error('Missing chapter range');
      await page.mouse.move(box.x + 10, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.83, box.y + box.height / 2, { steps: 10 });
      await expect(nav).toHaveClass(/is-scrubbing/);
      await expect(nav.locator('.compact-current-title')).toHaveText(tocHeadings[5]);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await page.mouse.up();
      await expect
        .poll(() =>
          page
            .getByRole('heading', { name: tocHeadings[5], exact: true })
            .evaluate((node) => node.getBoundingClientRect().top),
        )
        .toBeLessThan(220);
      await range.focus();
      await page.keyboard.press('Home');
      await expect(range).toHaveValue('0');
    }

    const box = await entry.boundingBox();
    if (!box) throw new Error('Missing entry');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 - (variant === 'edge' ? 45 : 0),
      box.y + box.height / 2 - (variant === 'edge' ? 0 : 45),
      { steps: 8 },
    );
    await page.mouse.up();
    await expect(entry).toHaveAttribute('aria-expanded', 'true');
    await expect(nav.locator('.compact-toc-panel')).toHaveCSS('opacity', '1');
    await expect(nav.locator('.compact-toc-panel')).not.toHaveAttribute('inert', '');
    await nav.locator('ol button').nth(4).click();
    await expect(entry).toHaveAttribute('aria-expanded', 'false');
    await expect(entry).toBeFocused();
    await expect
      .poll(() =>
        page
          .getByRole('heading', { name: tocHeadings[4], exact: true })
          .evaluate((node) => node.getBoundingClientRect().top),
      )
      .toBeLessThan(220);
    await expect(nav.getByRole('button', { name: '返回顶部', exact: true })).toBeEnabled();
    await expect
      .poll(async () =>
        Number(
          await nav.getByRole('progressbar', { name: '阅读进度' }).getAttribute('aria-valuenow'),
        ),
      )
      .toBeGreaterThan(0);
    await page.screenshot({ path: `design/article-toc/narrow/evidence/${variant}-article.png` });
    await nav.getByRole('button', { name: '返回顶部', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(nav.getByRole('button', { name: '返回顶部', exact: true })).toBeDisabled();
    await expect(nav.getByRole('progressbar', { name: '阅读进度' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );

    await entry.click();
    await page.keyboard.press('Escape');
    await expect(entry).toHaveAttribute('aria-expanded', 'false');
    await expect(entry).toBeFocused();
    await page.setViewportSize({ width: 768, height: 900 });
    await entry.click();
    const panel = await nav.locator('.compact-toc-panel').boundingBox();
    if (!panel) throw new Error('Missing expanded panel');
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(768);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(nav).toBeHidden();
    await expect(page.locator('.editor-soft-toc')).toBeVisible();
  });
}

test('default bookmark supports touch on short screens and progress without headings', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 568 },
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await page.route('**/v1/**', (route) =>
      route.fulfill({ json: tocFixtureResponse(new URL(route.request().url()).pathname) }),
    );
    await page.goto('http://127.0.0.1:5173/articles/toc-validation');
    const nav = page.locator('.compact-toc-edge');
    const entry = nav.locator('.compact-toc-entry');
    await expect(entry).toBeVisible();
    const box = await entry.boundingBox();
    if (!box) throw new Error('Missing bookmark');
    const client = await context.newCDPSession(page);
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (const dx of [10, 20, 35, 55]) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x - dx, y }],
      });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(entry).toHaveAttribute('aria-expanded', 'true');
    const panel = await nav.locator('.compact-toc-panel').boundingBox();
    const header = await page.locator('.editor-topbar').boundingBox();
    if (!panel || !header) throw new Error('Missing panel or header');
    expect(panel.y).toBeGreaterThanOrEqual(header.y + header.height);
    expect(panel.y + panel.height).toBeLessThanOrEqual(568);
    await page.screenshot({ path: 'design/article-toc/narrow/evidence/short-touch.png' });
    await nav.locator('ol button').nth(4).tap();
    await expect(entry).toHaveAttribute('aria-expanded', 'false');
    await expect(nav.getByRole('button', { name: '返回顶部' })).toBeEnabled();
    await nav.getByRole('button', { name: '返回顶部' }).tap();
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);

    await page.route('**/v1/articles/no-headings', (route) =>
      route.fulfill({
        json: {
          ...tocArticle,
          content: Array.from({ length: 30 }, () =>
            '没有章节标题的长文也会显示阅读进度。'.repeat(6),
          ).join('\n\n'),
        },
      }),
    );
    await page.goto('http://127.0.0.1:5173/articles/no-headings');
    await expect(page.getByLabel('正文编辑区')).toContainText('没有章节标题');
    await page.evaluate(() => scrollTo(0, 1400));
    await expect(nav.locator('.compact-toc-empty-strand')).toBeVisible();
    await expect(entry).toHaveCount(0);
    await expect
      .poll(async () => Number(await nav.getByRole('progressbar').getAttribute('aria-valuenow')))
      .toBeGreaterThan(0);
    await nav.getByRole('button', { name: '返回顶部' }).tap();
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await expect(nav).toHaveCount(0);
  } finally {
    await context.close();
  }
});
