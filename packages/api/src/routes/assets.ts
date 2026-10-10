import type { FastifyRequest } from 'fastify';
import type { PageHushFastifyInstance } from '../types/fastify.js';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { and, eq, lt } from 'drizzle-orm';
import { assets } from '../db/schema.js';
import type { Database } from '../db/client.js';
import type { StoragePort } from '../storage/port.js';
import { MAX_ASSET_FILE_SIZE } from '../config.js';
import { assetResponseSchema, errorResponseSchema } from '@pagehush/shared';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function matchesImageSignature(buffer: Buffer, mimeType: string) {
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }
  if (mimeType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
      buffer.subarray(8, 12).toString('latin1') === 'WEBP'
    );
  }
  return false;
}

const STALE_UPLOAD_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Opportunistic cleanup for uploads interrupted between the DB insert and the
 * object put. Runs fire-and-forget so it never blocks a fresh upload. When the
 * worker becomes real this belongs in its task loop instead.
 */
async function cleanupStaleUploads(db: Database, storage: StoragePort) {
  const staleBefore = new Date(Date.now() - STALE_UPLOAD_AGE_MS);
  const staleRows = await db
    .select({ id: assets.id, objectKey: assets.objectKey })
    .from(assets)
    .where(and(eq(assets.status, 'uploading'), lt(assets.createdAt, staleBefore)))
    .limit(20);

  for (const row of staleRows) {
    await storage.deleteObject(row.objectKey).catch(() => undefined);
    await db
      .update(assets)
      .set({ status: 'deleted', deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(assets.id, row.id));
  }
}

function extensionFor(filename: string, mimeType: string) {
  const parsed = extname(filename).toLowerCase();
  if (/^\.[a-z0-9]{1,8}$/.test(parsed)) return parsed;
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  return '';
}

export async function assetRoutes(app: PageHushFastifyInstance) {
  app.post(
    '/v1/assets',
    {
      schema: {
        response: {
          201: assetResponseSchema,
          400: errorResponseSchema,
          415: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!app.storage || !app.database) {
        return reply.status(503).send({ error: 'storage_not_configured' });
      }

      void cleanupStaleUploads(app.database, app.storage).catch(() => undefined);

      const file = await request.file({
        limits: {
          fileSize: MAX_ASSET_FILE_SIZE,
          files: 1,
        },
      });

      if (!file) return reply.status(400).send({ error: 'file_required' });

      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        return reply.status(415).send({ error: 'unsupported_media_type' });
      }

      const buffer = await file.toBuffer();
      if (!buffer.length) return reply.status(400).send({ error: 'file_empty' });
      if (!matchesImageSignature(buffer, file.mimetype)) {
        return reply.status(415).send({ error: 'file_content_mismatch' });
      }

      const kindField = file.fields.kind;
      const firstKindField = Array.isArray(kindField) ? kindField[0] : kindField;
      const kindValue = (firstKindField as unknown as { value?: unknown }).value;
      const kind = kindValue === 'cover' ? 'cover' : 'inline_image';
      const assetId = randomUUID();
      const checksum = createHash('sha256').update(buffer).digest('hex');
      const extension = extensionFor(file.filename, file.mimetype);
      const date = new Date();
      const objectKey = `drafts/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(
        2,
        '0',
      )}/${String(date.getUTCDate()).padStart(2, '0')}/${assetId}/${checksum}${extension}`;

      const [asset] = await app.database
        .insert(assets)
        .values({
          id: assetId,
          objectKey,
          originalName: file.filename,
          mimeType: file.mimetype,
          size: buffer.length,
          checksum,
          kind,
          status: 'uploading',
        })
        .returning();

      try {
        await app.storage.putObject({
          key: asset.objectKey,
          body: buffer,
          contentType: file.mimetype,
        });

        const [readyAsset] = await app.database
          .update(assets)
          .set({ status: 'ready', updatedAt: new Date() })
          .where(eq(assets.id, asset.id))
          .returning();

        return reply.status(201).send({
          id: readyAsset.id,
          objectKey: readyAsset.objectKey,
          originalName: readyAsset.originalName,
          mimeType: readyAsset.mimeType,
          size: readyAsset.size,
          checksum: readyAsset.checksum,
          kind: readyAsset.kind,
          status: readyAsset.status,
          url: `/v1/assets/${readyAsset.id}/content`,
        });
      } catch (error) {
        await app.database
          .update(assets)
          .set({ status: 'deleted', deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(assets.id, asset.id));
        throw error;
      }
    },
  );

  app.get(
    '/v1/assets/:id/content',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      if (!app.storage || !app.database) {
        return reply.status(503).send({ error: 'storage_not_configured' });
      }

      const [asset] = await app.database
        .select()
        .from(assets)
        .where(eq(assets.id, request.params.id));

      if (!asset || asset.status === 'deleted') {
        return reply.status(404).send({ error: 'asset_not_found' });
      }

      const object = await app.storage.getObject(asset.objectKey);

      reply.header('Content-Type', object.contentType ?? asset.mimeType);
      if (object.contentLength !== undefined) {
        reply.header('Content-Length', String(object.contentLength));
      }
      reply.header('ETag', object.etag ?? `"${asset.checksum}"`);
      reply.header('Cache-Control', 'private, max-age=31536000, immutable');

      return reply.send(object.body);
    },
  );
}
