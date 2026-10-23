import type { ApiArticle } from '../../../packages/web/src/lib/api';
import { tocArticle, tocFixtureResponse } from './toc-article';

const optionalArticleFields = {
  revision: 'rev-1',
  firstPublishedAt: null,
  shortId: null,
  author: 'Yohoia',
  sourceUrl: null,
  sourceSiteName: null,
  sourceSiteIconUrl: null,
  sourcePublishedAt: null,
  clipType: null,
  wordCount: null,
  readingTimeMinutes: null,
  sourceChecksum: null,
  coverAssetId: null,
  coverAlt: null,
  updatedAt: null,
  recordCreatedAt: '2026-10-09T00:00:00.000Z',
  recordUpdatedAt: '2026-10-09T00:00:00.000Z',
} as const;

export const transitionArticles: ApiArticle[] = [
  {
    ...tocArticle,
    ...optionalArticleFields,
    format: 'md',
    status: 'draft',
    language: 'zh',
    slug: 'cover-transition',
    cover: '/covers/upload-cover.png',
    description: '从卡片到一页完整的文章，让阅读自然接续。',
  },
  {
    ...tocArticle,
    ...optionalArticleFields,
    format: 'md',
    status: 'draft',
    language: 'zh',
    id: 'another-cover',
    slug: 'another-cover',
    title: '给念头留一点空白',
    cover: '/illustrations/empty-articles.png',
    description: '慢下来，重新看见那些细小的日常。',
  },
  {
    ...tocArticle,
    ...optionalArticleFields,
    format: 'md',
    status: 'draft',
    language: 'zh',
    id: 'without-cover',
    slug: 'without-cover',
    title: '没有封面的一页',
    cover: null,
  },
];

export function transitionFixtureResponse(path: string) {
  if (path === '/v1/articles') return transitionArticles;
  if (path.startsWith('/v1/articles/'))
    return transitionArticles.find((article) => path.endsWith('/' + article.slug));
  return tocFixtureResponse(path);
}
