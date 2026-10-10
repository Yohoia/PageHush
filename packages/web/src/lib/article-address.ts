import { articleShortId } from '@pagehush/shared';

export function articlePath(article: { id?: string; slug: string }) {
  const shortId = article.id ? articleShortId(article.id) : null;
  return shortId ? `/a/${shortId}` : `/articles/${encodeURIComponent(article.slug)}`;
}
