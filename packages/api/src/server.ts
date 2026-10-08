import { sql } from 'drizzle-orm';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  API_PREFIX,
  healthResponseSchema,
  applicationStageListSchema,
  applicationStages,
} from '@pagehush/shared';
import { readAuthConfig, readDatabaseConfig, readStorageConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { MinIOStorage } from './storage/minio.js';
import type { PageHushFastifyInstance } from './types/fastify.js';
import { articleRoutes } from './routes/articles.js';
import { assetRoutes } from './routes/assets.js';
import { topicRoutes } from './routes/topics.js';
import { tagRoutes } from './routes/tags.js';
import { authRoutes, findValidSession } from './routes/auth.js';

export interface BuildServerOptions {
  databaseUrl?: string;
}

export async function buildServer(options: BuildServerOptions = {}) {
  const databaseConfig = options.databaseUrl ? { url: options.databaseUrl } : readDatabaseConfig();
  const storageConfig = readStorageConfig();
  const authConfig = readAuthConfig();

  const app = Fastify({
    logger: { level: process.env.PAGEHUSH_API_LOG_LEVEL ?? 'info' },
  }).withTypeProvider<TypeBoxTypeProvider>() as PageHushFastifyInstance;

  const database = databaseConfig ? createDatabase(databaseConfig.url) : null;
  const storage = storageConfig ? new MinIOStorage(storageConfig) : null;
  const decorations = app as unknown as {
    decorate(name: string, value: unknown): void;
  };

  decorations.decorate('database', database?.db ?? null);
  decorations.decorate('databaseHandle', database);
  decorations.decorate('storage', storage);
  decorations.decorate('databaseConfigured', Boolean(database));
  decorations.decorate('authConfig', authConfig);
  decorations.decorate('storageConfigured', Boolean(storage));

  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, {
    max: Number(process.env.PAGEHUSH_API_RATE_LIMIT_MAX ?? 240),
    timeWindow: '1 minute',
  });

  if (process.env.PAGEHUSH_API_ENABLE_CORS === 'true') {
    await app.register(cors, { origin: true, credentials: true });
  }

  const publicApiRoutes = new Set([
    'GET /v1/health',
    'GET /v1/ready',
    'POST /v1/auth/login',
    'GET /v1/auth/session',
    'DELETE /v1/auth/logout',
  ]);

  app.addHook('preHandler', async (request, reply) => {
    if (request.method === 'OPTIONS') return;

    const pathname = request.raw.url?.split('?')[0] ?? '';
    if (publicApiRoutes.has(`${request.method} ${pathname}`)) return;

    if (!app.authConfig || !app.database) {
      await reply.status(503).send({ error: 'auth_not_configured' });
      return;
    }

    const session = await findValidSession(app, request);
    if (!session) {
      reply.clearCookie('pagehush_session', { path: '/' });
      await reply.status(401).send({ error: 'unauthorized' });
      return;
    }

    request.authSession = {
      id: session.id,
      expiresAt: session.expiresAt,
    };
  });

  app.get(`${API_PREFIX}/health`, {
    schema: { response: { 200: healthResponseSchema } },
    handler: async () => ({
      status: 'ok' as const,
      service: 'pagehush-api' as const,
      time: new Date().toISOString(),
    }),
  });

  app.get(`${API_PREFIX}/ready`, async (_request, reply) => {
    const checks: Record<string, 'ok' | 'not_configured' | 'error'> = {
      api: 'ok',
      database: database ? 'ok' : 'not_configured',
      storage: storage ? 'ok' : 'not_configured',
    };

    try {
      if (database) await database.db.execute(sql`select 1`);
    } catch {
      checks.database = 'error';
    }

    try {
      if (storage) await storage.health();
    } catch {
      checks.storage = 'error';
    }

    const ready = Object.values(checks).every((status) => status === 'ok');
    return reply.status(ready ? 200 : 503).send({ ready, checks });
  });

  app.get(`${API_PREFIX}/stages`, {
    schema: { response: { 200: applicationStageListSchema } },
    handler: async () => applicationStages,
  });

  app.setNotFoundHandler(async (_request, reply) => {
    await reply.status(404).send({ error: 'not_found' });
  });

  app.addHook('onClose', async () => {
    await app.databaseHandle?.close();
    app.storage?.close();
  });

  if (!database || !storage) {
    app.log.warn('PostgreSQL and MinIO must both be configured before content APIs are available');
    return app;
  }

  await app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
    },
  });

  await database.db.execute(sql`select 1`);
  app.log.info('PostgreSQL connection ready');

  await storage.ensureBucket();
  app.log.info({ bucket: storage.bucket }, 'MinIO bucket ready');

  await authRoutes(app);
  await topicRoutes(app);
  await tagRoutes(app);
  await articleRoutes(app);
  await assetRoutes(app);

  return app;
}
