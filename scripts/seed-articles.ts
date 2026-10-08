import { Pool, type PoolClient } from 'pg';
import { articles } from '../packages/web/src/data/articles.ts';

type Article = (typeof articles)[number];

function databaseStatus(status: Article['status']) {
  return status === 'published' ? 'published' : 'draft';
}

async function ensureId(
  client: PoolClient,
  table: 'categories' | 'tags',
  name: string,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into ${table} (name)
     values ($1)
     on conflict (name) do update set name = excluded.name, updated_at = now()
     returning id`,
    [name],
  );

  return result.rows[0].id;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    await client.query('begin');

    for (const article of articles) {
      const categoryId = await ensureId(client, 'categories', article.category);
      const tagIds: string[] = [];
      for (const tag of article.tags) {
        tagIds.push(await ensureId(client, 'tags', tag));
      }
      const status = databaseStatus(article.status);
      const publishedAt = status === 'published' ? article.publishedAt : null;

      const inserted = await client.query<{ id: string }>(
        `insert into articles (
          slug, title, excerpt, content, format, status, category_id,
          image_url, has_unpublished_changes, published_at
        )
        values ($1, $2, $3, $4, 'md', $5, $6, $7, $8, $9::timestamptz)
        on conflict (slug) do update set
          title = excluded.title,
          excerpt = excluded.excerpt,
          content = excluded.content,
          status = excluded.status,
          category_id = excluded.category_id,
          image_url = excluded.image_url,
          has_unpublished_changes = excluded.has_unpublished_changes,
          published_at = excluded.published_at,
          updated_at = now()
        returning id`,
        [
          article.id,
          article.title,
          article.excerpt,
          article.markdown,
          status,
          categoryId,
          article.image,
          article.status === 'modified',
          publishedAt,
        ],
      );

      const articleId = inserted.rows[0].id;
      await client.query('delete from article_tags where article_id = $1', [articleId]);

      if (tagIds.length) {
        await client.query(
          `insert into article_tags (article_id, tag_id)
           select $1::uuid, unnest($2::uuid[])
           on conflict do nothing`,
          [articleId, tagIds],
        );
      }
    }

    await client.query('commit');
    console.log(`Seeded ${articles.length} articles.`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
