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

export const articles: Article[] = [];

export const articleTopics = ['全部', '学习'];
export const articleTags: string[] = [];

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

export const defaultArticleContent = '';
