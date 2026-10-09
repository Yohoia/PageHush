import type { ApiArticle } from '../../../packages/web/src/lib/api';
import { tocArticle, tocFixtureResponse } from './toc-article';

export const transitionArticles: ApiArticle[] = [
  {
    ...tocArticle,
    format: 'md',
    status: 'draft',
    language: 'zh',
    slug: 'cover-transition',
    cover: '/covers/upload-cover.png',
    description: '从卡片到一页完整的文章，让阅读自然接续。',
  },
  {
    ...tocArticle,
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
