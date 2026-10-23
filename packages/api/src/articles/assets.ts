import { eq, inArray } from 'drizzle-orm';
import { fromMarkdown } from 'mdast-util-from-markdown';
import type { Nodes } from 'mdast';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import type { Database } from '../db/client.js';
import { assets, cliAssetUploads } from '../db/schema.js';
import type { articles } from '../db/schema.js';
import { CliArticleError } from './errors.js';
import { readAssetOrigin } from '../config.js';

type ArticleReferences = Pick<typeof articles.$inferSelect, 'content'> &
  Partial<Pick<typeof articles.$inferSelect, 'coverAssetId' | 'coverUrl' | 'format'>>;

/** Unknown MDX components can compute URLs; retain known CLI assets without evaluating code. */
export function potentialMdxAssetIds(article: ArticleReferences) {
  if (article.format !== 'mdx') return [];
  return [
    ...new Set(
      article.content
        .match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi)
        ?.map((id) => id.toLowerCase()) ?? [],
    ),
  ];
}

function assetIdFromUrl(value: string, origin: string) {
  const source = value.trim();
  if (!source.startsWith('/') && !/^https?:\/\//i.test(source)) return;
  try {
    const url = new URL(source, origin);
    if (url.origin !== origin || url.username || url.password) return;
    return /^\/v1\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/content$/i
      .exec(decodeURIComponent(url.pathname))?.[1]
      .toLowerCase();
  } catch {
    return;
  }
}

function attribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

/** Resolve rendered Markdown/HTML URLs, leaving code examples and external URLs alone. */
export function referencedAssetIds(article: ArticleReferences) {
  const ids = new Set<string>();
  const origin = readAssetOrigin();
  const tree = fromMarkdown(article.content);
  const definitions = new Map<string, string>();
  function collectDefinitions(node: Nodes) {
    if (node.type === 'definition' && !definitions.has(node.identifier))
      definitions.set(node.identifier, node.url);
    if ('children' in node) node.children.forEach(collectDefinitions);
  }
  collectDefinitions(tree);
  function resourceHtml(node: Nodes): string {
    if (node.type === 'html') return node.value;
    if (node.type === 'code' || node.type === 'inlineCode') return '';
    const children = 'children' in node ? node.children.map(resourceHtml).join('\n') : '';
    if (node.type === 'image' || node.type === 'link')
      return `<a href="${attribute(node.url)}">${children}</a>`;
    if (node.type === 'imageReference' || node.type === 'linkReference') {
      const url = definitions.get(node.identifier);
      return url ? `<a href="${attribute(url)}">${children}</a>` : children;
    }
    return children;
  }
  function addUrl(value: string) {
    const id = assetIdFromUrl(value, origin);
    if (id) ids.add(id);
  }
  function visitHtml(node: DefaultTreeAdapterMap['node']) {
    if ('tagName' in node) {
      if (['pre', 'code', 'script', 'style', 'template'].includes(node.tagName)) return;
      for (const attr of node.attrs) {
        if (
          (attr.name === 'src' &&
            ['audio', 'embed', 'iframe', 'img', 'input', 'source', 'track', 'video'].includes(
              node.tagName,
            )) ||
          (attr.name === 'href' && ['a', 'area', 'link', 'image', 'use'].includes(node.tagName)) ||
          (attr.name === 'poster' && node.tagName === 'video') ||
          (attr.name === 'data' && node.tagName === 'object')
        )
          addUrl(attr.value);
        if (attr.name === 'srcset' && ['img', 'source'].includes(node.tagName))
          attr.value.split(',').forEach((source) => addUrl(source.trim().split(/\s+/)[0]));
      }
    }
    if ('childNodes' in node) node.childNodes.forEach(visitHtml);
  }
  visitHtml(parseFragment(resourceHtml(tree)));
  if (article.coverUrl) addUrl(article.coverUrl);
  if (article.coverAssetId) ids.add(article.coverAssetId.toLowerCase());
  return [...ids].sort();
}

export async function lockReferencedAssets(db: Database, article: ArticleReferences) {
  const ids = new Set(referencedAssetIds(article));
  const mdxCandidates = potentialMdxAssetIds(article);
  if (mdxCandidates.length) {
    const uploads = await db
      .select({ assetId: cliAssetUploads.assetId })
      .from(cliAssetUploads)
      .where(inArray(cliAssetUploads.assetId, mdxCandidates));
    uploads.forEach((upload) => ids.add(upload.assetId));
  }
  for (const id of [...ids].sort()) {
    const [asset] = await db.select().from(assets).where(eq(assets.id, id)).for('update');
    if (!asset || asset.status !== 'ready') throw new CliArticleError(400, 'asset_not_ready');
  }
}
