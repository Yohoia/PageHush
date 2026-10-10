import { expect, test } from '@playwright/test';
import { tocArticle } from './fixtures/toc-article';

const lifeArticle = {
  ...tocArticle,
  id: 'life-article',
  slug: 'life-article',
  title: '周末的手冲咖啡',
  topic: '生活',
  topicId: 'topic-life',
};

test('topic filters follow server topics instead of a fixed list', async ({ page }) => {
  await page.route('**/v1/auth/session', (route) =>
    route.fulfill({ json: { authenticated: true } }),
  );
  await page.route('**/v1/health', (route) =>
    route.fulfill({ json: { status: 'ok', service: 'pagehush-api' } }),
  );
  await page.route('**/v1/topics', (route) =>
    route.fulfill({
      json: [
        { id: 'topic-life', name: '生活', articleCount: 1 },
        { id: 'topic-learning', name: '学习', articleCount: 0 },
      ],
    }),
  );
  await page.route('**/v1/articles?*', (route) => route.fulfill({ json: [lifeArticle] }));
  await page.route('**/v1/articles/life-article', (route) => route.fulfill({ json: lifeArticle }));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: lifeArticle.title })).toBeVisible();

  const lifeFilter = page.getByRole('button', { name: '生活', exact: true });
  await expect(lifeFilter).toBeVisible();
  await lifeFilter.click();
  await expect(page).toHaveURL(/topic=%E7%94%9F%E6%B4%BB/);
  await expect(page.getByRole('heading', { name: lifeArticle.title })).toBeVisible();

  await page.getByRole('button', { name: '全部', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: lifeArticle.title })).toBeVisible();
});
