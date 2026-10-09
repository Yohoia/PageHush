const paragraph =
  '午后的光落在桌面上，杯里的茶已经凉了。我关掉几个不停闪动的窗口，打开一张空白的纸。有时候，写作不为抵达哪里，只是想把匆忙经过的日子重新过一遍。';

export const tocHeadings = [
  '从一件小事开始',
  '留意，也是一种照顾',
  '把细节写下来',
  '给念头留一点空白',
  '允许这一页暂时没有结尾',
  '写给明天的自己',
  '慢一点，也没有关系',
];

export const tocArticle = {
  id: 'toc-validation',
  slug: 'toc-validation',
  title: '把日子，写慢一点',
  description: '',
  format: 'md',
  status: 'draft',
  language: 'zh',
  author: 'Yohoia',
  topic: '学习',
  topicId: null,
  tags: [],
  cover: null,
  coverAssetId: null,
  coverAlt: null,
  publishedAt: '2026-10-09T00:00:00.000Z',
  updatedAt: null,
  recordCreatedAt: '2026-10-09T00:00:00.000Z',
  recordUpdatedAt: '2026-10-09T00:00:00.000Z',
  content: tocHeadings
    .map(
      (title, index) =>
        `${[1, 2, 4].includes(index) ? '###' : '##'} ${title}\n\n${Array.from({ length: 3 }, () => paragraph).join('\n\n')}`,
    )
    .join('\n\n'),
};

export function tocFixtureResponse(path: string): unknown {
  if (path === '/v1/auth/session') return { authenticated: true };
  if (path === '/v1/topics') return [{ id: 'learning', name: '学习', articleCount: 1 }];
  if (path === '/v1/tags') return [];
  if (path === '/v1/health') return { status: 'ok' };
  if (path === '/v1/articles') return [tocArticle];
  if (path.startsWith('/v1/articles/')) return tocArticle;
  return {};
}
