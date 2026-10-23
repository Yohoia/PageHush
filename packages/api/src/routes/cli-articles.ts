import { randomUUID } from 'node:crypto';
import { and, desc, eq, ilike, isNull } from 'drizzle-orm';
import { Type, type Static } from 'typebox';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { articleIdFromShortId } from '@pagehush/shared';
import { articleOperations, articles } from '../db/schema.js';
import type { PageHushFastifyInstance } from '../types/fastify.js';
import { decoratedArticle } from '../articles/presentation.js';
import { CliArticleError } from '../articles/errors.js';
import {
  AUTHOR_OPERATION_SCOPE,
  writeOperation,
  outcomeFromStored,
  fingerprint,
  type OperationKind,
} from '../articles/operations.js';
import { slugify } from './utils.js';
import { cliUploadRoutes } from './cli-uploads.js';
import { lockReferencedAssets } from '../articles/assets.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const createBody = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: 200 }),
    description: Type.String({ minLength: 1, maxLength: 500 }),
    content: Type.String({ minLength: 1 }),
    language: Type.Union([Type.Literal('zh'), Type.Literal('en')]),
    format: Type.Literal('md'),
  },
  { additionalProperties: false },
);

function identifier(id: string) {
  const uuid = UUID.test(id) ? id : articleIdFromShortId(id);
  if (!uuid) throw new CliArticleError(404, 'article_not_found');
  return uuid;
}

function requestId(request: FastifyRequest) {
  const id = request.headers['x-request-id'];
  if (typeof id !== 'string' || !UUID.test(id))
    throw new CliArticleError(400, 'request_id_required');
  return id;
}

function owner(request: FastifyRequest) {
  if (!request.deviceSession) throw new CliArticleError(401, 'unauthorized');
  return AUTHOR_OPERATION_SCOPE;
}

function handleError(reply: FastifyReply, error: unknown) {
  if (error instanceof CliArticleError)
    return reply.status(error.statusCode).send({ error: error.code });
  throw error;
}

function revision(request: FastifyRequest) {
  const condition = request.headers['if-match'];
  if (typeof condition !== 'string' || !condition)
    throw new CliArticleError(428, 'revision_required');
  return condition;
}

export async function cliArticleRoutes(app: PageHushFastifyInstance) {
  await cliUploadRoutes(app);
  app.get(
    '/v1/cli/articles',
    async (
      request: FastifyRequest<{
        Querystring: { status?: string; q?: string; page?: string; pageSize?: string };
      }>,
      reply,
    ) => {
      if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });
      const { status, q } = request.query;
      const page = Number(request.query.page ?? 1);
      const pageSize = Number(request.query.pageSize ?? 20);
      if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        !Number.isSafeInteger(pageSize) ||
        pageSize < 1 ||
        pageSize > 200 ||
        !Number.isSafeInteger((page - 1) * pageSize) ||
        (status && status !== 'draft' && status !== 'published')
      )
        return reply.status(400).send({ error: 'invalid_pagination_or_status' });
      const conditions = [isNull(articles.deletedAt)];
      if (status === 'draft' || status === 'published')
        conditions.push(eq(articles.status, status));
      if (q)
        conditions.push(
          ilike(articles.title, `%${q.replace(/[\\%_]/g, (character) => `\\${character}`)}%`),
        );
      const rows = await app.database
        .select()
        .from(articles)
        .where(and(...conditions))
        .orderBy(desc(articles.recordUpdatedAt), desc(articles.id))
        .limit(pageSize + 1)
        .offset((page - 1) * pageSize);
      return {
        items: await Promise.all(
          rows.slice(0, pageSize).map((row) => decoratedArticle(app.database!, row)),
        ),
        nextPage: rows.length > pageSize ? page + 1 : null,
      };
    },
  );

  app.get(
    '/v1/cli/articles/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });
      try {
        const [article] = await app.database
          .select()
          .from(articles)
          .where(and(eq(articles.id, identifier(request.params.id)), isNull(articles.deletedAt)));
        if (!article) throw new CliArticleError(404, 'article_not_found');
        return decoratedArticle(app.database, article);
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );

  app.post(
    '/v1/cli/articles',
    { schema: { body: createBody } },
    async (request: FastifyRequest<{ Body: Static<typeof createBody> }>, reply) => {
      if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });
      try {
        const body = request.body;
        if (
          !body.title.trim() ||
          /[\r\n]/.test(body.title) ||
          !body.description.trim() ||
          !body.content.trim()
        )
          throw new CliArticleError(400, 'article_fields_required');
        const id = requestId(request);
        const result = await writeOperation(
          app.database,
          { id, ownerId: owner(request), kind: 'create', hash: fingerprint(body) },
          async (tx) => {
            await lockReferencedAssets(tx, body.content);
            const [article] = await tx
              .insert(articles)
              .values({
                ...body,
                title: body.title.trim(),
                slug: `${slugify(body.title, 'article')}-${randomUUID().slice(0, 8)}`,
                status: 'draft',
              })
              .returning();
            return { article: await decoratedArticle(tx, article), changed: true };
          },
        );
        return reply.status(201).send(result);
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );

  for (const kind of ['publish', 'delete'] satisfies OperationKind[]) {
    app.route({
      method: kind === 'publish' ? 'POST' : 'DELETE',
      url: kind === 'publish' ? '/v1/cli/articles/:id/publish' : '/v1/cli/articles/:id',
      handler: async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });
        try {
          const id = requestId(request);
          const articleId = identifier(request.params.id);
          const expected = revision(request);
          const result = await writeOperation(
            app.database,
            { id, ownerId: owner(request), kind, hash: fingerprint({ kind, articleId, expected }) },
            async (tx) => {
              const [current] = await tx
                .select()
                .from(articles)
                .where(and(eq(articles.id, articleId), isNull(articles.deletedAt)))
                .for('update');
              if (!current) throw new CliArticleError(404, 'article_not_found');
              if (current.revision !== expected)
                throw new CliArticleError(409, 'revision_conflict');
              if (kind === 'publish' && current.status === 'published')
                return { article: await decoratedArticle(tx, current), changed: false };
              if (
                kind === 'publish' &&
                (!current.title.trim() || !current.content.trim() || !current.description.trim())
              )
                throw new CliArticleError(400, 'publish_fields_required');
              const now = new Date();
              const [article] = await tx
                .update(articles)
                .set(
                  kind === 'publish'
                    ? {
                        status: 'published',
                        firstPublishedAt: current.firstPublishedAt ?? now,
                        publishedAt: current.firstPublishedAt ?? now,
                        updatedAt: current.firstPublishedAt ? current.updatedAt : null,
                        revision: randomUUID(),
                        recordUpdatedAt: now,
                      }
                    : { deletedAt: now, revision: randomUUID(), recordUpdatedAt: now },
                )
                .where(and(eq(articles.id, current.id), eq(articles.revision, expected)))
                .returning();
              if (!article) throw new CliArticleError(409, 'revision_conflict');
              return { article: await decoratedArticle(tx, article), changed: true };
            },
          );
          return result;
        } catch (error) {
          return handleError(reply, error);
        }
      },
    });
  }

  app.get(
    '/v1/cli/operations/:requestId',
    async (request: FastifyRequest<{ Params: { requestId: string } }>, reply) => {
      if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });
      try {
        if (!UUID.test(request.params.requestId))
          throw new CliArticleError(404, 'operation_unknown');
        const [row] = await app.database
          .select()
          .from(articleOperations)
          .where(
            and(
              eq(articleOperations.id, request.params.requestId),
              eq(articleOperations.ownerId, owner(request)),
            ),
          );
        if (!row) throw new CliArticleError(404, 'operation_unknown');
        if (row.expiresAt.getTime() <= Date.now())
          throw new CliArticleError(410, 'operation_expired');
        return row.result === null
          ? { requestId: row.id, status: 'pending' }
          : outcomeFromStored(row.id, row.result);
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );
}
