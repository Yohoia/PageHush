import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { deviceSessions } from '../db/device-auth-schema.js';
import type { PageHushFastifyInstance } from '../types/fastify.js';

export interface DeviceAuthConfig {
  verificationUri: string;
  now(): Date;
}

export function readDeviceAuthConfig(options?: Partial<DeviceAuthConfig>): DeviceAuthConfig {
  const uri = new URL(
    options?.verificationUri ??
      process.env.PAGEHUSH_DEVICE_VERIFICATION_URI ??
      'https://pagehush.yohoia.cn/device',
  );
  if (
    !['https:', 'http:'].includes(uri.protocol) ||
    uri.username ||
    uri.password ||
    uri.hash ||
    uri.search
  ) {
    throw new Error(
      'Device verification URI must be an absolute HTTP(S) URL without credentials, query, or fragment',
    );
  }
  return { verificationUri: uri.toString(), now: options?.now ?? (() => new Date()) };
}

export function hashDeviceSecret(secret: string) {
  return createHash('sha256').update(secret).digest('hex');
}

export function createDeviceSecret() {
  return randomBytes(32).toString('base64url');
}

export async function findValidDeviceSession(
  app: PageHushFastifyInstance,
  request: FastifyRequest,
) {
  const authorization = request.headers.authorization;
  if (!app.database || !authorization) return null;
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(authorization);
  if (!match) return null;
  const now = app.deviceAuth.now();
  const [session] = await app.database
    .select()
    .from(deviceSessions)
    .where(
      and(
        eq(deviceSessions.tokenHash, hashDeviceSecret(match[1])),
        gt(deviceSessions.expiresAt, now),
        isNull(deviceSessions.revokedAt),
      ),
    );
  if (!session) return null;
  await app.database
    .update(deviceSessions)
    .set({ lastUsedAt: now })
    .where(eq(deviceSessions.id, session.id));
  return { ...session, lastUsedAt: now };
}
