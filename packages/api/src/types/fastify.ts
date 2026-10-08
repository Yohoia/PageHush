import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyBaseLogger, FastifyInstance, RawServerDefault } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Database, DatabaseHandle } from '../db/client.js';
import type { AuthConfig } from '../config.js';
import type { MinIOStorage } from '../storage/minio.js';

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
  database?: Database;
  databaseHandle?: DatabaseHandle;
  storage?: MinIOStorage;
  authConfig?: AuthConfig;
  databaseConfigured: boolean;
  storageConfigured: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    database?: Database;
    databaseHandle?: DatabaseHandle;
    storage?: MinIOStorage;
    authConfig?: AuthConfig;
    databaseConfigured: boolean;
    storageConfigured: boolean;
  }

  interface FastifyRequest {
    authSession?: PageHushAuthSession;
  }
}
