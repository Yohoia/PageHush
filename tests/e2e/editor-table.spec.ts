import { expect, test } from '@playwright/test';
import { articleShortId } from '../../packages/shared/src/article-address';
import { tocArticle, tocFixtureResponse } from './fixtures/toc-article';

const id = '95ad948e-3101-45f4-8b5c-646c3b988251';
const shortId = articleShortId(id)!;
const tableArticle = {
  ...tocArticle,
  id,
  shortId,
  slug: 'table-validation',
  content: [
    '## 表格验证',
    '',
    '| 层 | 里面有什么 | 干嘛的 |',
    '| --- | --- | --- |',
    '| 技能 | teach | 教学流程 |',
    '| 扩展 | quiz | 出题与解释 |',
    '',
    '表格后正文保留。',
  ].join('\n'),
};

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/**', (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    const data =
      path === `/v1/articles/${id}`
        ? tableArticle
        : path === '/v1/articles'
          ? [tableArticle]
          : tocFixtureResponse(path);
    return route.fulfill({ json: data });
  });
});

test('opens and saves a Markdown table without dropping rows or following content', async ({ page }) => {
  let savedContent = '';
  await page.route(`**/v1/articles/${id}`, (route) => {
    if (route.request().method() === 'PATCH') {
      savedContent = route.request().postDataJSON().content;
    }
    return route.fulfill({ json: tableArticle });
  });
  await page.goto(`/a/${shortId}`);
  await expect(page.getByLabel('文章标题')).toHaveValue(tableArticle.title);
  const table = page.locator('.ProseMirror table');
  await expect(table).toHaveCount(1);
  await expect(table.locator('th,td')).toHaveText([
    '层',
    '里面有什么',
    '干嘛的',
    '技能',
    'teach',
    '教学流程',
    '扩展',
    'quiz',
    '出题与解释',
  ]);
  await expect(page.getByText('表格后正文保留。')).toBeVisible();

  await page.getByRole('button', { name: '保存文章', exact: true }).click();
  await expect.poll(() => savedContent).toMatch(/\| 层\s+\| 里面有什么\s+\| 干嘛的\s+\|/);
  await expect.poll(() => savedContent).toMatch(/\| 技能\s+\| teach\s+\| 教学流程\s+\|/);
  await expect.poll(() => savedContent).toMatch(/\| 扩展\s+\| quiz\s+\| 出题与解释\s+\|/);
});
