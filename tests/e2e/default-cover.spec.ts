import { expect, test } from '@playwright/test';
import { tocFixtureResponse } from './fixtures/toc-article';

const defaultCover = '/covers/default-cover.jpg';

test('uses the default cover before an article cover is uploaded', async ({ page }) => {
  await page.route('**/v1/**', (route) =>
    route.fulfill({ json: tocFixtureResponse(new URL(route.request().url()).pathname) }),
  );

  await page.goto('/');
  const card = page.locator('.article-card-media').first();
  await expect(card).toHaveAttribute('src', defaultCover);
  await card.evaluate((image: HTMLImageElement) => image.decode());

  await page.getByRole('link', { name: '进入文章：把日子，写慢一点' }).click();
  await expect(page.locator('.editor-cover img')).toHaveAttribute('src', defaultCover);
  await expect(page.locator('.editor-cover-default-note')).toContainText('默认封面 · 点击上传');
  await expect
    .poll(() =>
      page.locator('.editor-cover img').evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
});
