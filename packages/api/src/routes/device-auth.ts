import { randomBytes } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { Type } from 'typebox';
import {
  errorResponseSchema,
  deviceListResponseSchema,
  deviceVerificationBodySchema,
  deviceVerificationResponseSchema,
} from '@pagehush/shared';
import { deviceAuthorizations, deviceSessions } from '../db/device-auth-schema.js';
import { createDeviceSecret, hashDeviceSecret } from '../auth/device-auth.js';
import type { PageHushFastifyInstance } from '../types/fastify.js';

const AUTHORIZATION_TTL_SECONDS = 10 * 60;
const DEVICE_TTL_SECONDS = 30 * 24 * 60 * 60;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codeQuery = Type.Object({ user_code: Type.String({ minLength: 1, maxLength: 32 }) });

function normalizeUserCode(code: string) {
  return code.toUpperCase().replace(/[-\s]/g, '');
}

function displayUserCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function verificationResult(
  row: typeof deviceAuthorizations.$inferSelect,
  code: string,
  now: Date,
) {
  return {
    user_code: displayUserCode(normalizeUserCode(code)),
    name: row.name,
    status: row.expiresAt <= now ? ('expired' as const) : row.status,
    expiresAt: row.expiresAt.toISOString(),
  };
}

function deviceResult(row: typeof deviceSessions.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

export async function deviceAuthRoutes(app: PageHushFastifyInstance) {
  app.post(
    '/v1/auth/device/code',
    {
      schema: {
        body: Type.Object(
          { name: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })) },
          { additionalProperties: false },
        ),
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      if (!app.database || !app.authConfig)
        return reply.status(503).send({ error: 'auth_not_configured' });
      const name = request.body.name?.trim() || 'Yoho CLI';
      const deviceCode = createDeviceSecret();
      const code = [...randomBytes(8)]
        .map((value) => CODE_ALPHABET[value % CODE_ALPHABET.length])
        .join('');
      const now = app.deviceAuth.now();
      await app.database.insert(deviceAuthorizations).values({
        deviceCodeHash: hashDeviceSecret(deviceCode),
        userCodeHash: hashDeviceSecret(code),
        name,
        createdAt: now,
        expiresAt: new Date(now.getTime() + AUTHORIZATION_TTL_SECONDS * 1000),
        nextPollAt: now,
      });
      reply.header('cache-control', 'no-store');
      return {
        device_code: deviceCode,
        user_code: displayUserCode(code),
        verification_uri: app.deviceAuth.verificationUri,
        verification_uri_complete: `${app.deviceAuth.verificationUri}?user_code=${displayUserCode(code)}`,
        expires_in: AUTHORIZATION_TTL_SECONDS,
        interval: 5,
      };
    },
  );

  app.post(
    '/v1/auth/device/token',
    {
      schema: {
        body: Type.Object(
          {
            device_code: Type.String({ minLength: 1, maxLength: 256 }),
            grant_type: Type.String(),
          },
          { additionalProperties: false },
        ),
      },
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      reply.header('cache-control', 'no-store');
      if (!app.database || !app.authConfig)
        return reply.status(503).send({ error: 'auth_not_configured' });
      if (request.body.grant_type !== 'urn:ietf:params:oauth:grant-type:device_code')
        return reply.status(400).send({ error: 'unsupported_grant_type' });
      const now = app.deviceAuth.now();
      const result = await app.database.transaction(async (tx) => {
        const [authorization] = await tx
          .select()
          .from(deviceAuthorizations)
          .where(
            eq(deviceAuthorizations.deviceCodeHash, hashDeviceSecret(request.body.device_code)),
          )
          .for('update');
        if (!authorization || authorization.status === 'consumed')
          return { error: 'invalid_grant' };
        if (authorization.expiresAt <= now) return { error: 'expired_token' };
        if (authorization.status === 'denied') return { error: 'access_denied' };
        if (authorization.nextPollAt > now) {
          const interval = authorization.intervalSeconds + 5;
          await tx
            .update(deviceAuthorizations)
            .set({
              intervalSeconds: interval,
              nextPollAt: new Date(now.getTime() + interval * 1000),
            })
            .where(eq(deviceAuthorizations.id, authorization.id));
          return { error: 'slow_down', interval };
        }
        if (authorization.status === 'pending') {
          await tx
            .update(deviceAuthorizations)
            .set({ nextPollAt: new Date(now.getTime() + authorization.intervalSeconds * 1000) })
            .where(eq(deviceAuthorizations.id, authorization.id));
          return { error: 'authorization_pending' };
        }
        const token = createDeviceSecret();
        await tx.insert(deviceSessions).values({
          tokenHash: hashDeviceSecret(token),
          name: authorization.name,
          createdAt: now,
          lastUsedAt: now,
          expiresAt: new Date(now.getTime() + DEVICE_TTL_SECONDS * 1000),
        });
        await tx
          .update(deviceAuthorizations)
          .set({ status: 'consumed' })
          .where(eq(deviceAuthorizations.id, authorization.id));
        return {
          access_token: token,
          token_type: 'Bearer' as const,
          expires_in: DEVICE_TTL_SECONDS,
        };
      });
      return reply.status('error' in result ? 400 : 200).send(result);
    },
  );

  app.get(
    '/v1/auth/device/verify',
    {
      schema: {
        querystring: codeQuery,
        response: {
          200: deviceVerificationResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          410: errorResponseSchema,
        },
      },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const [authorization] = await app
        .database!.select()
        .from(deviceAuthorizations)
        .where(
          eq(
            deviceAuthorizations.userCodeHash,
            hashDeviceSecret(normalizeUserCode(request.query.user_code)),
          ),
        );
      if (!authorization) return reply.status(404).send({ error: 'authorization_not_found' });
      return verificationResult(authorization, request.query.user_code, app.deviceAuth.now());
    },
  );

  app.post(
    '/v1/auth/device/verify',
    {
      schema: {
        body: deviceVerificationBodySchema,
        response: {
          200: deviceVerificationResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          410: errorResponseSchema,
        },
      },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const now = app.deviceAuth.now();
      const result = await app.database!.transaction(async (tx) => {
        const [authorization] = await tx
          .select()
          .from(deviceAuthorizations)
          .where(
            eq(
              deviceAuthorizations.userCodeHash,
              hashDeviceSecret(normalizeUserCode(request.body.user_code)),
            ),
          )
          .for('update');
        if (!authorization) return { kind: 'missing' } as const;
        if (authorization.expiresAt <= now) return { kind: 'expired' } as const;
        const nextStatus = request.body.decision === 'approve' ? 'approved' : 'denied';
        if (authorization.status !== 'pending' && authorization.status !== nextStatus)
          return { kind: 'decided' } as const;
        const [updated] = await tx
          .update(deviceAuthorizations)
          .set({ status: nextStatus })
          .where(eq(deviceAuthorizations.id, authorization.id))
          .returning();
        return {
          kind: 'success',
          value: verificationResult(updated, request.body.user_code, now),
        } as const;
      });
      switch (result.kind) {
        case 'missing':
          return reply.status(404).send({ error: 'authorization_not_found' });
        case 'expired':
          return reply.status(410).send({ error: 'expired_token' });
        case 'decided':
          return reply.status(409).send({ error: 'authorization_already_decided' });
        case 'success':
          return result.value;
      }
    },
  );

  app.get(
    '/v1/auth/devices',
    { schema: { response: { 200: deviceListResponseSchema } } },
    async () => {
      const devices = await app
        .database!.select()
        .from(deviceSessions)
        .orderBy(desc(deviceSessions.createdAt), desc(deviceSessions.id));
      return { items: devices.map(deviceResult) };
    },
  );

  app.delete(
    '/v1/auth/devices/:id',
    {
      schema: { params: Type.Object({ id: Type.String({ format: 'uuid' }) }) },
    },
    async (request, reply) => {
      const [device] = await app
        .database!.select({ id: deviceSessions.id })
        .from(deviceSessions)
        .where(eq(deviceSessions.id, request.params.id));
      if (!device) return reply.status(404).send({ error: 'device_not_found' });
      await app
        .database!.update(deviceSessions)
        .set({ revokedAt: app.deviceAuth.now() })
        .where(and(eq(deviceSessions.id, request.params.id), isNull(deviceSessions.revokedAt)));
      return reply.status(204).send();
    },
  );

  app.get('/v1/auth/device/session', async (request, reply) => {
    if (!request.deviceSession) return reply.status(401).send({ error: 'unauthorized' });
    const [device] = await app
      .database!.select()
      .from(deviceSessions)
      .where(eq(deviceSessions.id, request.deviceSession.id));
    return { authenticated: true, ...deviceResult(device) };
  });

  app.delete('/v1/auth/device/logout', async (request, reply) => {
    if (!request.deviceSession) return reply.status(401).send({ error: 'unauthorized' });
    await app
      .database!.update(deviceSessions)
      .set({ revokedAt: app.deviceAuth.now() })
      .where(eq(deviceSessions.id, request.deviceSession.id));
    return reply.status(204).send();
  });
}
