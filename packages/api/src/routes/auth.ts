import type { FastifyRequest } from 'fastify';
import type { Static } from 'typebox';
import '@fastify/cookie';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { Type } from 'typebox';
import { authSessions } from '../db/schema.js';
import type { PageHushFastifyInstance } from '../types/fastify.js';
import { verifyAccessCode } from '../auth/access-code.js';

const SESSION_COOKIE = 'pagehush_session';
const SESSION_TTL_DAYS = 30;

const loginBodySchema = Type.Object({
  accessCode: Type.String({ minLength: 6, maxLength: 6 }),
  remember: Type.Optional(Type.Boolean()),
});

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

export function sessionTokenHash(token: string | undefined) {
  if (!token) return null;
  return createHash('sha256').update(token).digest('hex');
}

export async function findValidSession(app: PageHushFastifyInstance, request: FastifyRequest) {
  if (!app.database) return null;

  const tokenHash = sessionTokenHash(request.cookies?.[SESSION_COOKIE]);
  if (!tokenHash) return null;

  const [session] = await app.database
    .select()
    .from(authSessions)
    .where(and(eq(authSessions.tokenHash, tokenHash), gt(authSessions.expiresAt, new Date())));

  return session ?? null;
}

export async function authRoutes(app: PageHushFastifyInstance) {
  app.post(
    '/v1/auth/login',
    {
      schema: { body: loginBodySchema },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request: FastifyRequest<{ Body: Static<typeof loginBodySchema> }>, reply) => {
      if (!app.database) {
        return reply.status(503).send({ error: 'database_not_configured' });
      }
      if (!app.authConfig) {
        return reply.status(503).send({ error: 'access_code_not_configured' });
      }

      const valid = await verifyAccessCode(request.body.accessCode, app.authConfig.accessCodeHash);

      if (!valid) {
        return reply.status(401).send({ error: 'invalid_access_code' });
      }

      const token = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

      await app.database.delete(authSessions).where(lt(authSessions.expiresAt, new Date()));
      await app.database.insert(authSessions).values({
        tokenHash,
        expiresAt,
        userAgent: request.headers['user-agent'] ?? null,
      });

      reply.setCookie(SESSION_COOKIE, token, {
        path: '/',
        httpOnly: true,
        secure: app.authConfig.cookieSecure,
        sameSite: 'lax',
        ...(request.body.remember ? { maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 } : {}),
      });

      return reply.status(201).send({
        authenticated: true,
        expiresAt: expiresAt.toISOString(),
        remember: Boolean(request.body.remember),
      });
    },
  );

  app.get('/v1/auth/session', async (request, reply) => {
    if (!app.database) {
      return reply.status(503).send({ error: 'database_not_configured' });
    }

    const session = await findValidSession(app, request);
    if (!session) {
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return { authenticated: false };
    }

    await app.database
      .update(authSessions)
      .set({ lastUsedAt: new Date() })
      .where(eq(authSessions.id, session.id));

    return {
      authenticated: true,
      expiresAt: session.expiresAt.toISOString(),
    };
  });

  app.delete('/v1/auth/logout', async (request, reply) => {
    if (app.database) {
      const tokenHash = sessionTokenHash(request.cookies?.[SESSION_COOKIE]);
      if (tokenHash) {
        await app.database.delete(authSessions).where(eq(authSessions.tokenHash, tokenHash));
      }
    }

    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });
}
