import { expect, test } from '@playwright/test';

test('作者可以打开设备授权管理，不需要暴露任何设备令牌', async ({ page }) => {
  const login = await page.request.post('/v1/auth/login', {
    data: { accessCode: 'test-access-code', remember: false },
  });
  expect(login.status()).toBe(201);
  await page.goto('/devices');
  await expect(page.getByRole('heading', { name: '设备授权', exact: true })).toBeVisible();
  await expect(page.getByText('暂无设备授权')).toBeVisible();
});

test('登录后批准CLI设备并在网页撤销，令牌随即失效', async ({ page }) => {
  const issued = await page.request.post('/v1/auth/device/code', {
    data: { name: '浏览器验收终端' },
  });
  expect(issued.status()).toBe(200);
  const code = await issued.json();
  await page.goto(code.verification_uri_complete);
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await page.getByLabel('访问码').fill('test-access-code');
  await page.getByRole('button', { name: '解锁页息' }).click();
  await expect(page.getByRole('heading', { name: '确认 CLI 设备授权' })).toBeVisible();
  await expect(page.getByText('浏览器验收终端', { exact: true })).toBeVisible();
  await expect(page.getByText(code.user_code, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '批准授权', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已批准设备授权');
  const tokenResponse = await page.request.post('/v1/auth/device/token', {
    data: {
      device_code: code.device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    },
  });
  expect(tokenResponse.status()).toBe(200);
  const token = await tokenResponse.json();
  await page.goto('/devices');
  const device = page.getByRole('listitem').filter({ hasText: '浏览器验收终端' });
  await expect(device).toContainText('有效');
  await expect(page.locator('body')).not.toContainText(token.access_token);
  await device.getByRole('button', { name: '撤销授权：浏览器验收终端' }).click();
  await expect(device).toContainText('已撤销');
  const session = await fetch('http://127.0.0.1:5193/v1/auth/device/session', {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  expect(session.status).toBe(401);
});

test('文章保存冲突保留标题、正文和标签，不覆盖服务器的新内容', async ({ page }) => {
  expect(
    (
      await page.request.post('/v1/auth/login', {
        data: { accessCode: 'test-access-code', remember: false },
      })
    ).status(),
  ).toBe(201);
  const created = await page.request.post('/v1/articles', {
    data: {
      title: '保存冲突原稿',
      content: '原始正文',
      description: '原始摘要',
      topicName: '学习',
    },
  });
  expect(created.status()).toBe(201);
  const article = await created.json();
  await page.goto(`/a/${article.shortId}`);
  await expect(page.getByLabel('文章标题')).toHaveValue('保存冲突原稿');
  await page.getByLabel('文章标题').fill('浏览器未保存标题');
  await page.getByLabel('正文编辑区').fill('浏览器未保存正文');
  await page.getByRole('button', { name: '标签', exact: true }).click();
  await page.getByLabel('新增标签').fill('未保存标签');
  await page.getByLabel('新增标签').press('Enter');
  const remoteEdit = await page.request.patch(`/v1/articles/${article.id}`, {
    headers: { 'If-Match': article.revision },
    data: { title: '服务器新标题', content: '服务器新正文', tagNames: ['服务器标签'] },
  });
  expect(remoteEdit.status()).toBe(200);
  await page.getByRole('button', { name: '保存文章', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('文章已在其他地方更新');
  await expect(page.getByLabel('文章标题')).toHaveValue('浏览器未保存标题');
  await expect(page.getByLabel('正文编辑区')).toHaveText('浏览器未保存正文');
  await expect(page.locator('.editor-tag')).toContainText('未保存标签');
  const persisted = await page.request.get(`/v1/articles/${article.id}`);
  expect(await persisted.json()).toMatchObject({
    title: '服务器新标题',
    content: '服务器新正文',
    tags: ['服务器标签'],
  });
});

test('作者可以手动输入设备码拒绝授权，无效设备码有明确提示', async ({ page }) => {
  expect(
    (
      await page.request.post('/v1/auth/login', {
        data: { accessCode: 'test-access-code', remember: false },
      })
    ).status(),
  ).toBe(201);
  const issued = await page.request.post('/v1/auth/device/code', {
    data: { name: '拒绝授权终端' },
  });
  const code = await issued.json();
  await page.goto('/device');
  await page.getByLabel('设备码', { exact: true }).fill(code.user_code);
  await page.getByRole('button', { name: '查询设备', exact: true }).click();
  await expect(page.getByText('拒绝授权终端', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '拒绝授权', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已拒绝设备授权');
  const token = await page.request.post('/v1/auth/device/token', {
    data: {
      device_code: code.device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    },
  });
  expect(token.status()).toBe(400);
  expect(await token.json()).toEqual({ error: 'access_denied' });
  await page.getByLabel('设备码', { exact: true }).fill('ZZZZ-ZZZZ');
  await page.getByRole('button', { name: '查询设备', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('设备码无效');
  await expect(page.getByRole('button', { name: '批准授权', exact: true })).toHaveCount(0);
});

test('网页保存、发布、撤回和删除使用所见版本，冲突后保留输入', async ({ page }) => {
  expect(
    (
      await page.request.post('/v1/auth/login', {
        data: { accessCode: 'test-access-code', remember: false },
      })
    ).status(),
  ).toBe(201);
  const created = await page.request.post('/v1/articles', {
    data: {
      title: '版本保护整体验收',
      content: '验收正文',
      description: '验收摘要',
      topicName: '学习',
    },
  });
  const article = await created.json();
  await page.goto(`/a/${article.shortId}`);
  await expect(page.getByLabel('文章标题')).toHaveValue('版本保护整体验收');
  await page.getByLabel('文章标题').fill('版本保护已保存');
  await page.getByRole('button', { name: '保存文章', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已保存');
  const saved = await (await page.request.get(`/v1/articles/${article.id}`)).json();
  expect(saved.title).toBe('版本保护已保存');
  expect(saved.revision).not.toBe(article.revision);
  await page.goto('/');
  await page.getByRole('button', { name: '发布文章：版本保护已保存', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '撤回发布：版本保护已保存', exact: true }),
  ).toBeVisible();
  const published = await (await page.request.get(`/v1/articles/${article.id}`)).json();
  expect(published).toMatchObject({ status: 'published', firstPublishedAt: expect.any(String) });
  expect(
    (
      await page.request.patch(`/v1/articles/${article.id}`, {
        headers: { 'If-Match': published.revision },
        data: { title: '其他终端的新标题' },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole('button', { name: '撤回发布：版本保护已保存', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('文章已在其他地方更新');
  expect(await (await page.request.get(`/v1/articles/${article.id}`)).json()).toMatchObject({
    status: 'published',
    title: '其他终端的新标题',
  });
  await page.reload();
  await page.getByRole('button', { name: '撤回发布：其他终端的新标题', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '发布文章：其他终端的新标题', exact: true }),
  ).toBeVisible();
  const withdrawn = await (await page.request.get(`/v1/articles/${article.id}`)).json();
  expect(withdrawn.status).toBe('draft');
  await page.goto(`/a/${article.shortId}`);
  await expect(page.getByLabel('文章标题')).toHaveValue('其他终端的新标题');
  await page.getByLabel('文章标题').fill('删除前未保存标题');
  expect(
    (
      await page.request.patch(`/v1/articles/${article.id}`, {
        headers: { 'If-Match': withdrawn.revision },
        data: { description: '其他终端的新摘要' },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole('button', { name: '删除文章', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '删除文章', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('文章已在其他地方更新');
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByLabel('文章标题')).toHaveValue('删除前未保存标题');
  expect((await page.request.get(`/v1/articles/${article.id}`)).status()).toBe(200);
  await page.reload();
  await expect(page.getByLabel('文章标题')).toHaveValue('其他终端的新标题');
  await page.getByRole('button', { name: '删除文章', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '删除文章', exact: true }).click();
  await expect(page).toHaveURL('/');
  expect((await page.request.get(`/v1/articles/${article.id}`)).status()).toBe(404);
});
