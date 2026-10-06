import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  API_PREFIX,
  healthResponseSchema,
  applicationStageListSchema,
  applicationStages,
} from '@pagehush/shared';

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.PAGEHUSH_API_LOG_LEVEL ?? 'info',
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  if (process.env.PAGEHUSH_API_ENABLE_CORS === 'true') {
    await app.register(cors, { origin: true });
  }

  app.get(`${API_PREFIX}/health`, {
    schema: { response: { 200: healthResponseSchema } },
    handler: async () => ({
      status: 'ok' as const,
      service: 'pagehush-api' as const,
      time: new Date().toISOString(),
    }),
  });

  app.get(`${API_PREFIX}/stages`, {
    schema: { response: { 200: applicationStageListSchema } },
    handler: async () => applicationStages,
  });

  app.setNotFoundHandler(async (_request, reply) => {
    await reply.status(404).send({ error: 'not_found' });
  });

  return app;
}
