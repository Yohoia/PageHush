import { createHash, randomUUID } from 'node:crypto';
import { and, eq, gt, lt, lte, ne } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { PageHushFastifyInstance } from '../types/fastify.js';
import type { Database } from '../db/client.js';
import type { StoragePort } from '../storage/port.js';
import { articleOperations, articles, assets, cliAssetUploads } from '../db/schema.js';
import { MAX_ASSET_FILE_SIZE } from '../config.js';
import { matchesImageSignature } from './assets.js';
import { isUniqueConstraintError } from './utils.js';
import { CliArticleError } from '../articles/errors.js';
import { potentialMdxAssetIds, referencedAssetIds } from '../articles/assets.js';
import {
  AUTHOR_OPERATION_SCOPE,
  OPERATION_RETENTION_MS,
  reserveOperation,
  validateOperation,
} from '../articles/operations.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function cliUploadRoutes(app: PageHushFastifyInstance) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let collection: Promise<unknown> | undefined;
  const collect = () => {
    if (collection || !app.database || !app.storage) return;
    collection = cleanupCliOrphanAssets(app.database, app.storage)
      .catch((error: unknown) => app.log.error(error, 'CLI orphan collection failed'))
      .finally(() => {
        collection = undefined;
      });
  };
  app.addHook('onReady', async () => {
    collect();
    await collection;
    timer = setInterval(collect, 60 * 60 * 1000);
    timer.unref();
  });
  app.addHook('onClose', async () => {
    clearInterval(timer);
    await collection;
  });
  app.post(
    '/v1/cli/uploads/:operationId/assets',
    async (request: FastifyRequest<{ Params: { operationId: string } }>, reply) => {
      if (!app.database || !app.storage)
        return reply.status(503).send({ error: 'storage_not_configured' });
      const storage = app.storage;
      try {
        const ownerId = AUTHOR_OPERATION_SCOPE;
        if (!request.deviceSession) throw new CliArticleError(401, 'unauthorized');
        const operationId = request.params.operationId;
        const uploadId = request.headers['x-asset-id'];
        const expected = request.headers['x-content-sha256'];
        if (
          !UUID.test(operationId) ||
          typeof uploadId !== 'string' ||
          !UUID.test(uploadId) ||
          typeof expected !== 'string' ||
          !SHA256.test(expected)
        )
          throw new CliArticleError(400, 'upload_identity_required');
        const file = await request.file({ limits: { fileSize: MAX_ASSET_FILE_SIZE, files: 1 } });
        if (!file || file.fieldname !== 'file') throw new CliArticleError(400, 'file_required');
        const buffer = await file.toBuffer();
        const kindField = file.fields.kind;
        const kind = Array.isArray(kindField) ? kindField[0] : kindField;
        if (!kind || kind.type !== 'field' || kind.value !== 'inline_image')
          throw new CliArticleError(403, 'inline_image_only');
        if (!IMAGE_TYPES.has(file.mimetype) || !matchesImageSignature(buffer, file.mimetype))
          throw new CliArticleError(415, 'unsupported_image');
        if (buffer.length > MAX_ASSET_FILE_SIZE || file.file.truncated)
          throw new CliArticleError(413, 'image_too_large');
        const checksum = createHash('sha256').update(buffer).digest('hex');
        if (checksum !== expected) throw new CliArticleError(400, 'checksum_mismatch');
        const hash = `${checksum}:${file.mimetype}:${buffer.length}`;
        await reserveOperation(app.database, operationId, ownerId, 'create', null);
        const assetId = await app.database.transaction(async (tx) => {
          const [operation] = await tx
            .select()
            .from(articleOperations)
            .where(eq(articleOperations.id, operationId))
            .for('update');
          validateOperation(operation, ownerId, 'create', null);
          const [existing] = await tx
            .select()
            .from(cliAssetUploads)
            .where(eq(cliAssetUploads.id, uploadId));
          if (existing) {
            if (existing.operationId !== operationId || existing.fingerprint !== hash)
              throw new CliArticleError(409, 'request_conflict');
            return existing.assetId;
          }
          if (operation.result !== null) throw new CliArticleError(409, 'operation_completed');
          const id = randomUUID();
          await tx.insert(assets).values({
            id,
            objectKey: `cli/${operationId}/${id}`,
            originalName: file.filename,
            mimeType: file.mimetype,
            size: buffer.length,
            checksum,
            kind: 'inline_image',
            status: 'uploading',
          });
          await tx
            .insert(cliAssetUploads)
            .values({ id: uploadId, operationId, assetId: id, fingerprint: hash });
          return id;
        });
        // The durable intent exists before storage is touched, so retries and collection can find a partial upload.
        await app.database.transaction(async (tx) => {
          const [operation] = await tx
            .select()
            .from(articleOperations)
            .where(eq(articleOperations.id, operationId))
            .for('update');
          validateOperation(operation, ownerId, 'create', null);
          const [asset] = await tx
            .select()
            .from(assets)
            .where(eq(assets.id, assetId))
            .for('update');
          if (asset.status === 'ready') return;
          if (asset.status === 'deleted') throw new CliArticleError(410, 'operation_expired');
          await storage.putObject({
            key: asset.objectKey,
            body: buffer,
            contentType: file.mimetype,
          });
          await tx
            .update(assets)
            .set({ status: 'ready', updatedAt: new Date() })
            .where(eq(assets.id, assetId));
        });
        return reply.status(201).send({ id: assetId, url: `/v1/assets/${assetId}/content` });
      } catch (error) {
        if (isUniqueConstraintError(error))
          return reply.status(409).send({ error: 'request_conflict' });
        if (error instanceof CliArticleError)
          return reply.status(error.statusCode).send({ error: error.code });
        throw error;
      }
    },
  );
}

/** Only CLI-owned uploads are eligible; committed or soft-deleted article references remain protected. */
export async function cleanupCliOrphanAssets(
  db: Database,
  storage: StoragePort,
  options: { now?: Date; limit?: number } = {},
) {
  const now = options.now ?? new Date();
  const staleBefore = new Date(now.getTime() - OPERATION_RETENTION_MS);
  const limit = options.limit ?? 20;
  let deleted = 0;
  let cursor: string | undefined;
  while (deleted < limit) {
    const candidates = await db
      .select({ operationId: cliAssetUploads.operationId, assetId: cliAssetUploads.assetId })
      .from(cliAssetUploads)
      .innerJoin(assets, eq(assets.id, cliAssetUploads.assetId))
      .innerJoin(articleOperations, eq(articleOperations.id, cliAssetUploads.operationId))
      .where(
        and(
          lt(cliAssetUploads.createdAt, staleBefore),
          lte(articleOperations.expiresAt, now),
          ne(assets.status, 'deleted'),
          cursor ? gt(assets.id, cursor) : undefined,
        ),
      )
      .orderBy(assets.id)
      .limit(Math.max(limit, 20));
    if (!candidates.length) break;
    for (const candidate of candidates) {
      cursor = candidate.assetId;
      const claimed = await db.transaction(async (tx) => {
        const [operation] = await tx
          .select()
          .from(articleOperations)
          .where(eq(articleOperations.id, candidate.operationId))
          .for('update');
        if (operation.expiresAt > now) return null;
        const [asset] = await tx
          .select()
          .from(assets)
          .where(eq(assets.id, candidate.assetId))
          .for('update');
        if (!asset || asset.status === 'deleted') return null;
        const possibleReferences = await tx
          .select({
            content: articles.content,
            format: articles.format,
            coverUrl: articles.coverUrl,
            coverAssetId: articles.coverAssetId,
          })
          .from(articles);
        if (
          possibleReferences.some(
            (article) =>
              referencedAssetIds(article).includes(asset.id) ||
              potentialMdxAssetIds(article).includes(asset.id),
          )
        )
          return null;
        // A durable non-ready state prevents a new article from referencing the object after collection starts.
        await tx
          .update(assets)
          .set({ status: 'uploading', updatedAt: now })
          .where(eq(assets.id, asset.id));
        return asset;
      });
      if (!claimed) continue;
      await storage.deleteObject(claimed.objectKey);
      if (claimed.publicObjectKey) await storage.deleteObject(claimed.publicObjectKey);
      await db
        .update(assets)
        .set({ status: 'deleted', deletedAt: now, updatedAt: now })
        .where(eq(assets.id, claimed.id));
      deleted += 1;
      if (deleted >= limit) break;
    }
  }

  return { deleted };
}
