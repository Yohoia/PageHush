import { Pool, type PoolClient } from 'pg';
import { articles } from '../packages/web/src/data/articles.ts';

async function ensureId(
  client: PoolClient,
  table: 'topics' | 'tags',
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
      const topicId = await ensureId(client, 'topics', article.topic);
      const tagIds: string[] = [];
      for (const tag of article.tags) {
        tagIds.push(await ensureId(client, 'tags', tag));
      }

      const inserted = await client.query<{ id: string }>(
        `insert into articles (
          slug, title, description, content, format, status, language, author,
          topic_id, cover_url, published_at
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11::timestamptz
        )
        on conflict (slug) do update set
          title = excluded.title,
          description = excluded.description,
          content = excluded.content,
          format = excluded.format,
          status = excluded.status,
          language = excluded.language,
          author = excluded.author,
          topic_id = excluded.topic_id,
          cover_url = excluded.cover_url,
          published_at = excluded.published_at,
          record_updated_at = now()
        returning id`,
        [
          article.slug,
          article.title,
          article.description,
          article.content,
          article.format,
          article.status,
          article.language,
          article.author,
          topicId,
          article.cover,
          article.publishedAt,
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
