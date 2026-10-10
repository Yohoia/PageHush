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
import {
  readAuthConfig,
  readDatabaseConfig,
  readStorageConfig,
  type AuthConfig,
} from './config.js';
import { createDatabase, type DatabaseHandle } from './db/client.js';
import { MinIOAdapter } from './storage/minio.js';
import type { StoragePort } from './storage/port.js';
import type { PageHushFastifyInstance } from './types/fastify.js';
import { articleRoutes } from './routes/articles.js';
import { assetRoutes } from './routes/assets.js';
import { topicRoutes } from './routes/topics.js';
import { tagRoutes } from './routes/tags.js';
import { authRoutes, findValidSession } from './routes/auth.js';

/** Dependencies can be injected so route behaviour is testable without live services. */
export interface BuildServerOptions {
  database?: DatabaseHandle;
  storage?: StoragePort;
  authConfig?: AuthConfig;
}

export async function buildServer(options: BuildServerOptions = {}) {
  const databaseConfig = readDatabaseConfig();
  const storageConfig = readStorageConfig();
  const authConfig = options.authConfig ?? readAuthConfig();

  const app = Fastify({
    logger: { level: process.env.PAGEHUSH_API_LOG_LEVEL ?? 'info' },
  }).withTypeProvider<TypeBoxTypeProvider>() as PageHushFastifyInstance;

  const database = options.database ?? (databaseConfig ? createDatabase(databaseConfig.url) : null);
  const storage = options.storage ?? (storageConfig ? new MinIOAdapter(storageConfig) : null);

  app.decorate('database', database?.db ?? null);
  app.decorate('databaseHandle', database);
  app.decorate('storage', storage);
  app.decorate('databaseConfigured', Boolean(database));
  app.decorate('authConfig', authConfig);
  app.decorate('storageConfigured', Boolean(storage));

  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, {
    max: Number(process.env.PAGEHUSH_API_RATE_LIMIT_MAX ?? 240),
    timeWindow: '1 minute',
  });

  const corsOrigins = (process.env.PAGEHUSH_API_CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (process.env.PAGEHUSH_API_ENABLE_CORS === 'true') {
    if (!corsOrigins.length) {
      app.log.warn(
        'PAGEHUSH_API_CORS_ORIGINS is empty; refusing to enable CORS with reflected origins',
      );
    } else {
      await app.register(cors, {
        origin(origin, callback) {
          callback(null, Boolean(origin && corsOrigins.includes(origin)));
        },
        credentials: true,
      });
    }
  }

  const publicApiRoutes = new Set([
    'GET /v1/health',
    'GET /v1/ready',
    'POST /v1/auth/login',
    'POST /v1/auth/login-extension',
    'GET /v1/auth/session',
    'DELETE /v1/auth/logout',
  ]);

  // Unhandled 5xx errors must not leak driver or SQL details to clients.
  app.setErrorHandler((error: unknown, request, reply) => {
    const statusCode =
      (typeof error === 'object' && error !== null && 'statusCode' in error
        ? (error as { statusCode?: number }).statusCode
        : undefined) ?? 500;

    if (statusCode < 500) {
      return reply.status(statusCode).send(error);
    }

    request.log.error(error);
    return reply.status(500).send({ error: 'internal_error' });
  });

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
