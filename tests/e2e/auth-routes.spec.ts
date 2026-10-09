import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/auth/session', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
});

for (const path of ['/articles/demo', '/editor/demo', '/editor/demo-anything']) {
  test(`requires authentication for ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(`/login?redirect=${encodeURIComponent(path)}`);
    await expect(page.getByRole('button', { name: '解锁页息' })).toBeVisible();
    await expect(page.getByLabel('文章标题')).toHaveCount(0);
  });
}
