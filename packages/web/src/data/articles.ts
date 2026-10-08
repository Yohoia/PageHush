import type { ArticleStatus } from '@pagehush/shared';

export type { ArticleStatus };

export const MAX_ARTICLE_TAGS = 3;

export interface Article {
  slug: string;
  cover: string;
  topic: string;
  title: string;
  description: string;
  content: string;
  format: 'md' | 'mdx';
  status: ArticleStatus;
  language: 'zh' | 'en';
  author: string;
  publishedAt: string;
  tags: string[];
}

const continuation = [
  '## 从一件小事开始',
  '',
  '先把可见的部分写下来，再让结构慢慢浮现。',
  '',
  '> 记录不是为了立刻完成，而是为了让思路有一个可以停留的位置。',
  '',
  '- 保留一个具体细节',
  '- 写下一个尚未回答的问题',
  '- 允许这一页暂时没有结论',
].join('\n');

export const articles: Article[] = [
  {
    slug: 'walking-gently',
    cover: '/articles/article-01.jpg',
    topic: '随笔',
    format: 'md',
    language: 'zh',
    author: 'Yohoia',
    title: '一个人走路时，世界会悄悄变得温柔',
    description: '在独处的行走中，城市的噪音渐渐退去，我们重新听见内心的声音。',
    publishedAt: '2024-03-08',
    tags: ['独处', '城市', '散步'],
    status: 'draft',
    content: [
      '在独处的行走中，城市的噪音渐渐退去，我们重新听见内心的声音。',
      '',
      continuation,
    ].join('\n'),
  },
  {
    slug: 'paper-books',
    cover: '/articles/article-02.jpg',
    topic: '阅读',
    format: 'md',
    language: 'zh',
    author: 'Yohoia',
    title: '我为什么依然喜欢纸质书',
    description:
      '在屏幕无处不在的时代，纸质书依然是一种温柔而坚定的存在。它让阅读成为一次真正的相遇。',
    publishedAt: '2024-03-05',
    tags: ['纸质书', '阅读', '慢生活'],
    status: 'published',
    content: [
      '在屏幕无处不在的时代，纸质书依然是一种温柔而坚定的存在。它让阅读成为一次真正的相遇。',
      '',
      continuation,
    ].join('\n'),
  },
  {
    slug: 'ordinary-days',
    cover: '/articles/article-03.jpg',
    topic: '生活',
    format: 'md',
    language: 'zh',
    author: 'Yohoia',
    title: '在普通的日子里，发现微小的美好',
    description: '阳光落在桌角，风吹动窗帘，咖啡的香气，都是生活悄悄送来的礼物。',
    publishedAt: '2024-03-01',
    tags: ['日常', '观察', '生活'],
    status: 'draft',
    content: [
      '阳光落在桌角，风吹动窗帘，咖啡的香气，都是生活悄悄送来的礼物。',
      '',
      continuation,
    ].join('\n'),
  },
  {
    slug: 'spring-growing',
    cover: '/articles/article-04.jpg',
    topic: '观察',
    format: 'md',
    language: 'zh',
    author: 'Yohoia',
    title: '春天来时，万物都在认真生长',
    description: '走在熟悉的街道上，忽然发现树梢已冒出新绿。春天总是这样，在不经意间来到我们身边。',
    publishedAt: '2024-02-27',
    tags: ['春天', '街道', '自然'],
    status: 'published',
    content: [
      '走在熟悉的街道上，忽然发现树梢已冒出新绿。春天总是这样，在不经意间来到我们身边。',
      '',
      continuation,
    ].join('\n'),
  },
  {
    slug: 'writing-order',
    cover: '/articles/article-05.jpg',
    topic: '创作',
    format: 'md',
    language: 'zh',
    author: 'Yohoia',
    title: '关于写作：在混乱的生活中，建立秩序',
    description: '写作不是为了被看见，而是为了看见自己。在文字里，我们整理思绪，也安放情绪。',
    publishedAt: '2024-02-20',
    tags: ['写作', '秩序', '思考'],
    status: 'draft',
    content: [
      '写作不是为了被看见，而是为了看见自己。在文字里，我们整理思绪，也安放情绪。',
      '',
      continuation,
    ].join('\n'),
  },
  {
    slug: 'toward-nature',
    cover: '/articles/article-06.jpg',
    topic: '专题',
    format: 'md',
    language: 'zh',
    author: 'Yohoia',
    title: '走向自然：山、海与更广阔的自己',
    description: '当我们走进自然，才发现自己的渺小，也因此获得了真正的自由。',
    publishedAt: '2024-02-15',
    tags: ['自然', '山海', '自由'],
    status: 'draft',
    content: ['当我们走进自然，才发现自己的渺小，也因此获得了真正的自由。', '', continuation].join(
      '\n',
    ),
  },
  {
    slug: 'home-energy',
    cover: '/articles/article-07.jpg',
    topic: '生活',
    format: 'md',
    language: 'zh',
    author: 'Yohoia',
    title: '让家成为能量的容器',
    description: '一个干净、温暖、充满喜欢之物的家，能在疲惫的日子里，为我们重新充电。',
    publishedAt: '2024-02-10',
    tags: ['家', '能量', '休息'],
    status: 'published',
    content: [
      '一个干净、温暖、充满喜欢之物的家，能在疲惫的日子里，为我们重新充电。',
      '',
      continuation,
    ].join('\n'),
  },
  {
    slug: 'on-the-road',
    cover: '/articles/article-08.jpg',
    topic: '随笔',
    format: 'md',
    language: 'zh',
    author: 'Yohoia',
    title: '在路上：关于旅行与自我的对话',
    description: '旅行的意义，也许不在于看过多少风景，而是在不断出发中，重新认识自己。',
    publishedAt: '2024-02-04',
    tags: ['旅行', '自我', '出发'],
    status: 'draft',
    content: [
      '旅行的意义，也许不在于看过多少风景，而是在不断出发中，重新认识自己。',
      '',
      continuation,
    ].join('\n'),
  },
];

export const articleTopics = ['全部', ...new Set(articles.map((article) => article.topic))];
export const articleTags = [...new Set(articles.flatMap((article) => article.tags))].sort((a, b) =>
  a.localeCompare(b, 'zh-CN'),
);

export const articleStatusLabels: Record<ArticleStatus, string> = {
  draft: '草稿',
  published: '已发布',
};

export function getArticleDisplayStatus(article: { status: ArticleStatus }) {
  return {
    status: article.status,
    label: articleStatusLabels[article.status],
  };
}

export const defaultArticleContent = [
  '午后的光落在桌面上，杯里的茶已经凉了。我关掉几个不停闪动的窗口，打开一张空白的纸。',
  '',
  '有时候，写作不为抵达哪里。只是想把匆忙经过的日子，重新过一遍。',
  '',
  continuation,
].join('\n');
