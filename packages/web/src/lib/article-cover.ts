export const DEFAULT_ARTICLE_COVER = '/covers/default-cover.jpg';

export function getArticleCover(article: { cover: string | null }) {
  return article.cover || DEFAULT_ARTICLE_COVER;
}
