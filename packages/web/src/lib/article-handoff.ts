import type { ApiArticle } from './api';

// A single in-memory handoff from the clicked card; never persisted or used as authorization.
let incoming: { article: ApiArticle; created: number } | undefined;

export function handoffArticle(article: ApiArticle) {
  incoming = { article, created: Date.now() };
}

export function getArticleHandoff(slug: string | undefined) {
  return incoming && incoming.article.slug === slug && Date.now() - incoming.created < 15_000
    ? incoming.article
    : undefined;
}

export function clearArticleHandoff(slug: string) {
  if (incoming?.article.slug === slug) incoming = undefined;
}
