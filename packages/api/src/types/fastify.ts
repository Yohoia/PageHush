import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyBaseLogger, FastifyInstance, RawServerDefault } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Database, DatabaseHandle } from '../db/client.js';
import type { AuthConfig } from '../config.js';
import type { DeviceAuthConfig } from '../auth/device-auth.js';
import type { StoragePort } from '../storage/port.js';

export interface PageHushAuthSession {
  id: string;
  expiresAt: Date;
}

export interface PageHushFastifyInstance extends FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse<IncomingMessage>,
  FastifyBaseLogger,
  TypeBoxTypeProvider
> {
  database?: Database | null;
  databaseHandle?: DatabaseHandle | null;
  storage?: StoragePort | null;
  authConfig?: AuthConfig | null;
  databaseConfigured: boolean;
  storageConfigured: boolean;
  deviceAuth: DeviceAuthConfig;
}

declare module 'fastify' {
  interface FastifyInstance {
    database?: Database | null;
    databaseHandle?: DatabaseHandle | null;
    storage?: StoragePort | null;
    authConfig?: AuthConfig | null;
    databaseConfigured: boolean;
    storageConfigured: boolean;
    deviceAuth: DeviceAuthConfig;
  }

  interface FastifyRequest {
    authSession?: PageHushAuthSession;
    deviceSession?: PageHushAuthSession;
  }
}
