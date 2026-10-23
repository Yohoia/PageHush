import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import type { articles } from '../db/schema.js';
import { articleTags, tags, topics } from '../db/schema.js';
import { publicArticle } from '../routes/articles.js';

type ArticleRow = typeof articles.$inferSelect;
export function cliArticle(row: ArticleRow, topic: string | null = null, tagNames: string[] = []) {
  return {
    ...publicArticle(row, topic, tagNames),
    publishedAt: row.firstPublishedAt?.toISOString() ?? null,
  };
}

export async function decoratedArticle(db: Database, row: ArticleRow) {
  const topicRows = row.topicId
    ? await db.select({ name: topics.name }).from(topics).where(eq(topics.id, row.topicId))
    : [];
  const tagRows = await db
    .select({ name: tags.name })
    .from(articleTags)
    .innerJoin(tags, eq(tags.id, articleTags.tagId))
    .where(eq(articleTags.articleId, row.id));
  return cliArticle(
    row,
    topicRows[0]?.name ?? null,
    tagRows.map((tag) => tag.name).sort((a, b) => a.localeCompare(b, 'zh-CN')),
  );
}
