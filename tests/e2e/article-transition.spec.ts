import { expect, test } from '@playwright/test';
import { transitionArticles, transitionFixtureResponse } from './fixtures/transition-articles';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('**/v1/**', (route) =>
    route.fulfill({ json: transitionFixtureResponse(new URL(route.request().url()).pathname) }),
  );
});

test('shows the clicked title and decoded cover before the detail request returns', async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let responded = false;
  await page.route('**/v1/articles/cover-transition', async (route) => {
    await held;
    responded = true;
    await route.fulfill({ json: transitionArticles[0] });
  });
  await page.goto('/');
  const source = page.locator('.article-card-media').first();
  await source.evaluate((image: HTMLImageElement) => image.decode());
  const sourceRect = await source.boundingBox();
  await page
    .getByRole('link', { name: `进入文章：${transitionArticles[0].title}`, exact: true })
    .click();
  await expect(page).toHaveURL(/\/articles\/cover-transition$/);
  await expect(page.getByLabel('文章标题')).toHaveValue(transitionArticles[0].title);
  await expect(page.locator('.editor-cover img')).toBeVisible();
  expect(responded).toBe(false);
  await expect(page.locator('html')).toHaveAttribute('data-article-transition', 'running');
  if (!sourceRect) throw new Error('Missing source cover');
  await expect
    .poll(() =>
      page.evaluate(() =>
        parseFloat(
          getComputedStyle(document.documentElement, '::view-transition-group(article-cover)')
            .width,
        ),
      ),
    )
    .toBeGreaterThan(sourceRect.width);
  const group = await page.evaluate(() => {
    const style = getComputedStyle(
      document.documentElement,
      '::view-transition-group(article-cover)',
    );
    return { width: parseFloat(style.width), transform: style.transform };
  });
  const destinationRect = await page.locator('.editor-cover img').boundingBox();
  if (!destinationRect) throw new Error('Missing destination cover');
  expect(group.width).toBeGreaterThan(sourceRect.width);
  expect(group.width).toBeLessThan(destinationRect.width);
  expect(
    await page.evaluate(
      () =>
        getComputedStyle(document.documentElement, '::view-transition-old(article-cover)').opacity,
    ),
  ).toBe('0');
  await page.screenshot({
    path: 'design/article-transition/evidence/mid-transition.png',
    animations: 'allow',
  });
  await expect(page.locator('html')).not.toHaveAttribute('data-article-transition');
  expect(responded).toBe(false);
  await expect(page.getByLabel('正文编辑区')).toContainText('从一件小事开始');
  await expect(page.getByLabel('正文编辑区')).toHaveAttribute('contenteditable', 'false');
  await page.evaluate(() => {
    (window as Window & { originalEditor?: Element | null }).originalEditor =
      document.querySelector('.tiptap');
  });
  release();
  await expect(page.locator('.editor-page')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('正文编辑区')).toHaveAttribute('contenteditable', 'true');
  expect(
    await page.evaluate(
      () =>
        (window as Window & { originalEditor?: Element }).originalEditor ===
        document.querySelector('.tiptap'),
    ),
  ).toBe(true);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 900 },
]) {
  test(`cover lands without overflow at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page
      .locator('.article-card-media')
      .first()
      .evaluate((image: HTMLImageElement) => image.decode());
    await page
      .getByRole('link', { name: `进入文章：${transitionArticles[0].title}`, exact: true })
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-article-transition', 'running');
    await page.screenshot({
      path: `design/article-transition/evidence/mid-${viewport.width}.png`,
      animations: 'allow',
    });
    await expect(page.locator('html')).not.toHaveAttribute('data-article-transition');
    await expect(page.getByLabel('文章标题')).toHaveValue(transitionArticles[0].title);
    const cover = await page.locator('.editor-cover img').boundingBox();
    if (!cover) throw new Error('Missing cover');
    expect(cover.x).toBeGreaterThanOrEqual(0);
    expect(cover.x + cover.width).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: '返回上一页' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.locator('.article-card')).toHaveCount(3);
    await expect(page.locator('html')).not.toHaveAttribute('data-article-transition');
    await page
      .getByRole('link', { name: `进入文章：${transitionArticles[1].title}`, exact: true })
      .click();
    await expect(page.getByLabel('文章标题')).toHaveValue(transitionArticles[1].title);
    await expect(page.locator('.editor-cover img')).toHaveAttribute(
      'src',
      transitionArticles[1].cover!,
    );
  });
}

for (const fallback of ['reduced-motion', 'unsupported', 'no-cover'] as const) {
  test(`${fallback} keeps navigation and fresh data`, async ({ page }) => {
    if (fallback === 'reduced-motion') await page.emulateMedia({ reducedMotion: 'reduce' });
    if (fallback === 'unsupported') {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.addInitScript(() => {
        Reflect.set(document, 'startViewTransition', undefined);
        const marker = window as Window & { __pagehushSawOverlayEngine?: boolean };
        marker.__pagehushSawOverlayEngine = false;
        const originalCreateElement = document.createElement.bind(document);
        document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
          const element = originalCreateElement(tagName, options);
          if (tagName.toLowerCase() === 'canvas') marker.__pagehushSawOverlayEngine = true;
          return element;
        }) as typeof document.createElement;
      });
    }
    const article = transitionArticles[fallback === 'no-cover' ? 2 : 0];
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fresh = {
      ...article,
      title: '服务器上的最新标题',
      content: '## 更新后的内容\n\n这段正文来自最新的服务响应。',
    };
    await page.route(`**/v1/articles/${article.slug}`, async (route) => {
      await held;
      await route.fulfill({ json: fresh });
    });
    await page.goto('/');
    await page
      .locator(`.article-card[data-article-slug='${article.slug}'] .article-card-media`)
      .evaluate((image: HTMLImageElement) => image.decode());
    await page.getByRole('link', { name: `进入文章：${article.title}` }).focus();
    await page.keyboard.press('Enter');
    if (fallback === 'unsupported') {
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as Window & { __pagehushSawOverlayEngine?: boolean })
                .__pagehushSawOverlayEngine,
          ),
        )
        .toBe(true);
    }
    await expect(page.getByLabel('文章标题')).toHaveValue(article.title);
    await expect(page.locator('html')).not.toHaveAttribute('data-article-transition');
    await expect(page.getByLabel('文章标题')).toHaveAttribute('readonly', '');
    release();
    await expect(page.getByLabel('文章标题')).toHaveValue(fresh.title);
    await expect(page.getByLabel('正文编辑区')).toContainText('这段正文来自最新的服务响应。');
    await expect(page.getByLabel('正文编辑区')).toHaveAttribute('contenteditable', 'true');
    await page.getByLabel('文章标题').fill('可以正常编辑的标题');
    await expect(page.getByLabel('文章标题')).toHaveValue('可以正常编辑的标题');
  });
}

test('resize and browser back can interrupt the cover transition', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('.article-card-media')
    .first()
    .evaluate((image: HTMLImageElement) => image.decode());
  await page
    .getByRole('link', { name: `进入文章：${transitionArticles[0].title}`, exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page).toHaveURL(/\/articles\/cover-transition$/);
  await expect(page.getByLabel('文章标题')).toHaveValue(transitionArticles[0].title);
  await expect(page.locator('html')).not.toHaveAttribute('data-article-transition');
  await page.goBack();
  await expect(page.locator('.article-card')).toHaveCount(3);
  await expect(page.locator('html')).not.toHaveAttribute('data-article-transition');
  const link = page.getByRole('link', {
    name: `进入文章：${transitionArticles[1].title}`,
    exact: true,
  });
  await link.click();
  await expect(page).toHaveURL(/\/articles\/another-cover$/);
  await page.goBack();
  await expect(page).toHaveURL('/');
  await expect(page.locator('html')).not.toHaveAttribute('data-article-transition');
  await expect(page.locator('.article-card')).toHaveCount(3);
  await page
    .getByRole('link', { name: `进入文章：${transitionArticles[0].title}`, exact: true })
    .click();
  await expect(page.getByLabel('文章标题')).toHaveValue(transitionArticles[0].title);
});

test('a failed detail request retains the preview and does not enable saving', async ({ page }) => {
  await page.route('**/v1/articles/cover-transition', (route) =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } }),
  );
  await page.goto('/');
  await page
    .getByRole('link', { name: `进入文章：${transitionArticles[0].title}`, exact: true })
    .click();
  await expect(page.getByLabel('文章标题')).toHaveValue(transitionArticles[0].title);
  await expect(page.locator('.editor-cover img')).toHaveAttribute(
    'src',
    transitionArticles[0].cover!,
  );
  await expect(page.getByRole('alert')).toContainText('文章加载失败');
  await expect(page.getByRole('button', { name: '保存文章' })).toBeDisabled();
  await expect(page.locator('html')).not.toHaveAttribute('data-article-transition');
  await page.route('**/v1/articles/cover-transition', (route) =>
    route.fulfill({ json: transitionArticles[0] }),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('文章标题')).toHaveValue(transitionArticles[0].title);
  await expect(page.getByRole('button', { name: '保存文章' })).toBeEnabled();
});

test('resets editor state when the article slug changes', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const nextArticle = {
    ...transitionArticles[1],
    content: '## 另一篇文章\n\n这一段属于第二个 slug。',
  };

  await page.route('**/v1/articles/another-cover', async (route) => {
    await held;
    await route.fulfill({ json: nextArticle });
  });

  await page.goto('/articles/cover-transition');
  await expect(page.getByLabel('文章标题')).toHaveValue(transitionArticles[0].title);
  await expect(page.getByLabel('正文编辑区')).toContainText('从一件小事开始');

  await page.evaluate(() => {
    history.pushState({}, '', '/articles/another-cover');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  await expect(page.locator('.editor-page')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByLabel('文章标题')).toHaveValue('');
  await expect(page.getByLabel('正文编辑区')).not.toContainText('从一件小事开始');
  await expect(page.getByLabel('正文编辑区')).toHaveAttribute('contenteditable', 'false');

  release();
  await expect(page.locator('.editor-page')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('文章标题')).toHaveValue(nextArticle.title);
  await expect(page.getByLabel('正文编辑区')).toContainText('另一篇文章');
  await expect(page.getByLabel('正文编辑区')).toHaveAttribute('contenteditable', 'true');
});

test('a rapid double click creates one history entry and one destination', async ({ page }) => {
  await page.goto('/');
  const before = await page.evaluate(() => history.length);
  await page
    .locator('.article-card-media')
    .first()
    .evaluate((image: HTMLImageElement) => image.decode());
  await page
    .getByRole('link', { name: `进入文章：${transitionArticles[0].title}`, exact: true })
    .dblclick({ delay: 20 });
  await expect(page.getByLabel('文章标题')).toHaveValue(transitionArticles[0].title);
  await expect(page.locator('html')).not.toHaveAttribute('data-article-transition');
  expect(await page.evaluate(() => history.length)).toBe(before + 1);
  await page.goBack();
  await expect(page).toHaveURL('/');
  await expect(page.locator('.article-card')).toHaveCount(3);
});

for (const action of ['button', 'browser'] as const) {
  for (const width of [1440, 390]) {
    test(`${action} return at ${width}px gently reveals the card without moving the cover`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      const cards = Array.from({ length: 12 }, (_, index) => ({
        ...transitionArticles[0],
        id: `cover-${index}`,
        slug: `cover-${index}`,
        title: `慢慢读，第 ${index + 1} 页`,
      }));
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let holdList = false;
      let pending = false;
      await page.route('**/v1/articles', async (route) => {
        if (holdList) {
          pending = true;
          await held;
        }
        await route.fulfill({ json: cards });
      });
      await page.route('**/v1/articles/cover-*', (route) =>
        route.fulfill({
          json: cards.find((article) =>
            route
              .request()
              .url()
              .endsWith('/' + article.slug),
          ),
        }),
      );
      await page.goto('/?topic=%E5%AD%A6%E4%B9%A0');
      const card = page.locator('.article-card[data-article-slug="cover-7"]');
      const cell = page.locator('.article-card-cell').filter({ has: card });
      await expect(cell).toHaveCSS('opacity', '1');
      await expect(cell).toHaveCSS('transform', 'none');
      await card.scrollIntoViewIfNeeded();
      await card
        .locator('.article-card-media')
        .evaluate((image: HTMLImageElement) => image.decode());
      const scrollY = await page.evaluate(() => window.scrollY);
      await card.locator('.article-card-open-link').click();
      await expect(page.getByLabel('文章标题')).toHaveValue(cards[7].title);
      await expect(page.locator('html')).not.toHaveAttribute('data-article-transition');
      holdList = true;
      await page.evaluate(() => {
        const samples: number[] = [];
        (window as Window & { returnSamples?: number[] }).returnSamples = samples;
        new MutationObserver(() => {
          const card = document.querySelector('.article-card[data-article-slug="cover-7"]');
          const cell = card?.closest('.article-card-cell');
          if (cell) samples.push(Number(getComputedStyle(cell).opacity));
        }).observe(document.getElementById('root')!, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style'],
        });
      });
      if (action === 'button') await page.getByRole('button', { name: '返回上一页' }).click();
      else await page.goBack();
      await expect(page).toHaveURL('/?topic=%E5%AD%A6%E4%B9%A0');
      await expect(page.locator('.article-card')).toHaveCount(12);
      await expect(page.getByRole('button', { name: '学习', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.locator('html')).not.toHaveAttribute('data-article-transition');
      await expect(page.locator('canvas.article-cover-flight')).toHaveCount(0);
      await expect(page.locator('.app-route-surface')).toHaveCSS('opacity', '1');
      await page.screenshot({
        path: `design/article-transition/evidence/return-${action}-${width}.png`,
        animations: 'allow',
      });
      await expect(cell).toHaveCSS('opacity', '1');
      await expect(cell).toHaveCSS('transform', 'none');
      expect(
        await page.evaluate(() =>
          (window as Window & { returnSamples?: number[] }).returnSamples?.some(
            (opacity) => opacity >= 0.45 && opacity < 1,
          ),
        ),
      ).toBe(true);
      expect(pending).toBe(true);
      expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(scrollY, 0);
      await expect(card.locator('.article-card-media')).toBeVisible();
      release();
    });
  }
}
