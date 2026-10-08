import type { DatabaseHandle } from '../db/client.js';
import type { MinIOStorage } from '../storage/minio.js';

declare module 'fastify' {
  interface FastifyInstance {
    database?: DatabaseHandle;
    storage?: MinIOStorage;
    databaseConfigured: boolean;
    storageConfigured: boolean;
  }
}
