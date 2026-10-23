import type { FastifyRequest } from 'fastify';
import { Type } from 'typebox';
import type { Static } from 'typebox';
import type { PageHushFastifyInstance } from '../types/fastify.js';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { articleTags, articles, tags } from '../db/schema.js';
import { createTagBodySchema, updateTagBodySchema } from './schemas.js';
import { errorResponseSchema, tagResponseSchema } from '@pagehush/shared';
import { isUniqueConstraintError, normalizeName } from './utils.js';
import { lockArticleTaxonomy, reviseArticles } from '../articles/taxonomy.js';

type TagIdRequest = FastifyRequest<{ Params: { id: string } }>;
type CreateTagRequest = FastifyRequest<{ Body: Static<typeof createTagBodySchema> }>;
function publicTag(
  tag: Pick<typeof tags.$inferSelect, 'id' | 'name' | 'createdAt' | 'updatedAt'>,
  articleCount?: number,
) {
  return {
    id: tag.id,
    name: tag.name,
    createdAt: tag.createdAt.toISOString(),
    updatedAt: tag.updatedAt.toISOString(),
    ...(articleCount !== undefined ? { articleCount } : {}),
  };
}

type UpdateTagRequest = FastifyRequest<{
  Params: { id: string };
  Body: Static<typeof updateTagBodySchema>;
}>;

export async function tagRoutes(app: PageHushFastifyInstance) {
  app.get(
    '/v1/tags',
    {
      schema: {
        response: {
          200: Type.Array(tagResponseSchema),
          503: errorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

      const rows = await app.database
        .select({
          id: tags.id,
          name: tags.name,
          createdAt: tags.createdAt,
          updatedAt: tags.updatedAt,
          articleCount: sql<number>`count(${articles.id})::int`,
        })
        .from(tags)
        .leftJoin(articleTags, eq(articleTags.tagId, tags.id))
        .leftJoin(articles, and(eq(articles.id, articleTags.articleId), isNull(articles.deletedAt)))
        .groupBy(tags.id, tags.name, tags.createdAt)
        .orderBy(tags.name);

      return rows.map((row) => publicTag(row, Number(row.articleCount)));
    },
  );

  app.post(
    '/v1/tags',
    {
      schema: {
        body: createTagBodySchema,
        response: {
          201: tagResponseSchema,
          400: errorResponseSchema,
          409: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request: CreateTagRequest, reply) => {
      if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

      const name = normalizeName(request.body.name);
      if (!name) return reply.status(400).send({ error: 'name_required' });

      try {
        const [tag] = await app.database.insert(tags).values({ name }).returning();
        return reply.status(201).send(publicTag(tag, 0));
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          return reply.status(409).send({ error: 'tag_already_exists' });
        }
        throw error;
      }
    },
  );

  app.patch(
    '/v1/tags/:id',
    {
      schema: {
        body: updateTagBodySchema,
        response: {
          200: tagResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request: UpdateTagRequest, reply) => {
      if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

      const name = normalizeName(request.body.name);
      if (!name) return reply.status(400).send({ error: 'name_required' });

      try {
        const tag = await app.database.transaction(async (tx) => {
          await lockArticleTaxonomy(tx, 'write');
          await reviseArticles(
            tx,
            inArray(
              articles.id,
              tx
                .select({ id: articleTags.articleId })
                .from(articleTags)
                .where(eq(articleTags.tagId, request.params.id)),
            ),
          );
          const [updated] = await tx
            .update(tags)
            .set({ name, updatedAt: new Date() })
            .where(eq(tags.id, request.params.id))
            .returning();
          return updated;
        });

        if (!tag) return reply.status(404).send({ error: 'tag_not_found' });
        return publicTag(tag);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          return reply.status(409).send({ error: 'tag_already_exists' });
        }
        throw error;
      }
    },
  );

  app.delete(
    '/v1/tags/:id',
    {
      schema: {
        response: {
          404: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request: TagIdRequest, reply) => {
      if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

      const deleted = await app.database.transaction(async (tx) => {
        await lockArticleTaxonomy(tx, 'write');
        await reviseArticles(
          tx,
          inArray(
            articles.id,
            tx
              .select({ id: articleTags.articleId })
              .from(articleTags)
              .where(eq(articleTags.tagId, request.params.id)),
          ),
        );
        return tx.delete(tags).where(eq(tags.id, request.params.id)).returning({ id: tags.id });
      });

      if (!deleted.length) return reply.status(404).send({ error: 'tag_not_found' });
      return reply.status(204).send();
    },
  );
}
