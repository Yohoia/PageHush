import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { assets } from '../db/schema.js';
import { CliArticleError } from './errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function referencedAssetIds(content: string) {
  const ids = new Set<string>();
  for (const match of content.matchAll(/\/v1\/assets\/([0-9a-f-]{36})\/content/gi)) {
    if (UUID.test(match[1])) ids.add(match[1].toLowerCase());
  }
  return [...ids].sort();
}

export async function lockReferencedAssets(
  db: Database,
  content: string,
  coverAssetId?: string | null,
) {
  const ids = new Set(referencedAssetIds(content));
  if (coverAssetId) ids.add(coverAssetId);
  for (const id of [...ids].sort()) {
    const [asset] = await db.select().from(assets).where(eq(assets.id, id)).for('update');
    if (!asset || asset.status !== 'ready') throw new CliArticleError(400, 'asset_not_ready');
  }
}
