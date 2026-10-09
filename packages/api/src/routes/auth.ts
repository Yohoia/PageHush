import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Static } from 'typebox';
import '@fastify/cookie';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { Type } from 'typebox';
import { authSessions } from '../db/schema.js';
import type { PageHushFastifyInstance } from '../types/fastify.js';
import { verifyAccessCode } from '../auth/access-code.js';

const SESSION_COOKIE = 'pagehush_session';
const SESSION_TOKEN_HEADER = 'x-pagehush-session';
const SESSION_TTL_DAYS = 30;
const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

const loginBodySchema = Type.Object({
  accessCode: Type.String({ minLength: 6, maxLength: 6 }),
  remember: Type.Optional(Type.Boolean()),
});

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_TOKEN_HEADER_NAME = SESSION_TOKEN_HEADER;

function firstHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function sessionTokenHash(token: string | undefined) {
  if (!token) return null;
  return createHash('sha256').update(token).digest('hex');
}

async function createSession(
  app: PageHushFastifyInstance,
  userAgent: string | undefined,
  remember: boolean,
) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await app.database!.delete(authSessions).where(lt(authSessions.expiresAt, new Date()));
  await app.database!.insert(authSessions).values({
    tokenHash,
    expiresAt,
    userAgent,
  });

  return { token, expiresAt, remember };
}

export async function findValidSession(app: PageHushFastifyInstance, request: FastifyRequest) {
  if (!app.database) return null;

  const cookieTokenHash = sessionTokenHash(request.cookies?.[SESSION_COOKIE]);
  const headerToken = firstHeaderValue(request.headers[SESSION_TOKEN_HEADER]);
  const headerTokenHash = sessionTokenHash(headerToken);
  const tokenHash = cookieTokenHash ?? headerTokenHash;
  if (!tokenHash) return null;

  const [session] = await app.database
    .select()
    .from(authSessions)
    .where(and(eq(authSessions.tokenHash, tokenHash), gt(authSessions.expiresAt, new Date())));

  return session ?? null;
}

async function createLoginRoute(
  app: PageHushFastifyInstance,
  request: FastifyRequest<{ Body: Static<typeof loginBodySchema> }>,
  reply: FastifyReply,
  options: { cookie: boolean },
) {
  if (!app.database) {
    return reply.status(503).send({ error: 'database_not_configured' });
  }
  if (!app.authConfig) {
    return reply.status(503).send({ error: 'access_code_not_configured' });
  }

  const valid = await verifyAccessCode(request.body.accessCode, app.authConfig.accessCodeHash);
  if (!valid) return reply.status(401).send({ error: 'invalid_access_code' });

  const session = await createSession(
    app,
    request.headers['user-agent'],
    Boolean(request.body.remember),
  );

  if (options.cookie) {
    reply.setCookie(SESSION_COOKIE, session.token, {
      path: '/',
      httpOnly: true,
      secure: app.authConfig.cookieSecure,
      sameSite: 'lax',
      ...(session.remember ? { maxAge: SESSION_TTL_SECONDS } : {}),
    });

    return reply.status(201).send({
      authenticated: true,
      expiresAt: session.expiresAt.toISOString(),
      remember: session.remember,
    });
  }

  return reply.status(201).send({
    authenticated: true,
    sessionToken: session.token,
    expiresAt: session.expiresAt.toISOString(),
    remember: session.remember,
  });
}

export async function authRoutes(app: PageHushFastifyInstance) {
  app.post(
    '/v1/auth/login',
    {
      schema: { body: loginBodySchema },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      return createLoginRoute(app, request, reply, { cookie: true });
    },
  );

  app.post(
    '/v1/auth/login-extension',
    {
      schema: { body: loginBodySchema },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      return createLoginRoute(app, request, reply, { cookie: false });
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
      const token =
        request.cookies?.[SESSION_COOKIE] ??
        firstHeaderValue(request.headers[SESSION_TOKEN_HEADER]);
      const tokenHash = sessionTokenHash(token);

      if (tokenHash) {
        await app.database.delete(authSessions).where(eq(authSessions.tokenHash, tokenHash));
      }
    }

    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });
}
