import { expect, test } from '@playwright/test';
import { tocArticle, tocFixtureResponse } from './fixtures/toc-article';

test('uses a library return snapshot only once', async ({ page }) => {
  const first = { ...tocArticle, title: '第一次返回的快照' };
  const second = { ...tocArticle, title: '刷新后的最新文章' };
  const client = await page.context().newCDPSession(page);
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });

  await page.route('**/v1/**', (route) =>
    route.fulfill({
      headers: { 'Cache-Control': 'no-store' },
      json:
        new URL(route.request().url()).pathname === '/v1/articles'
          ? [first]
          : tocFixtureResponse(new URL(route.request().url()).pathname),
    }),
  );

  await page.goto('/');
  await expect(page.getByRole('heading', { name: first.title })).toBeVisible();
  await page.getByRole('link', { name: `进入文章：${first.title}` }).click();
  await expect(page.getByLabel('文章标题')).toHaveValue(first.title);

  await page.goBack();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: first.title })).toBeVisible();

  await page.unroute('**/v1/**');
  await page.route('**/v1/**', (route) =>
    route.fulfill({
      headers: { 'Cache-Control': 'no-store' },
      json: tocFixtureResponse(new URL(route.request().url()).pathname),
    }),
  );
  await page.route('**/v1/articles', (route) =>
    route.fulfill({
      headers: { 'Cache-Control': 'no-store' },
      json: [second],
    }),
  );
  await page.getByRole('link', { name: '写作' }).click();
  await expect(page).toHaveURL('/editor');
  await expect(page.getByLabel('文章标题')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: second.title })).toBeVisible();
  await expect(page.getByRole('heading', { name: first.title })).toHaveCount(0);
});
