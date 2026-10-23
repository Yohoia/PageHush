import { sql, type SQL } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { articles } from '../db/schema.js';

const TAXONOMY_LOCK_ID = 73029;

/** Take before article row locks, so taxonomy edits cannot miss newly attached articles. */
export async function lockArticleTaxonomy(db: Database, mode: 'read' | 'write') {
  await db.execute(
    mode === 'read'
      ? sql`select pg_advisory_xact_lock_shared(${TAXONOMY_LOCK_ID})`
      : sql`select pg_advisory_xact_lock(${TAXONOMY_LOCK_ID})`,
  );
}

export async function reviseArticles(db: Database, condition: SQL) {
  await db
    .select({ id: articles.id })
    .from(articles)
    .where(condition)
    .orderBy(articles.id)
    .for('update');
  await db
    .update(articles)
    .set({ revision: sql`gen_random_uuid()`, recordUpdatedAt: new Date() })
    .where(condition);
}
