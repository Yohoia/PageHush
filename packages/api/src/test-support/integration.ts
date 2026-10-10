import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../db/schema.js';
import type { DatabaseHandle } from '../db/client.js';
import type { StoragePort, StoredObject } from '../storage/port.js';
import { buildServer } from '../server.js';
import { createAccessCodeHash } from '../auth/access-code.js';
import { Readable } from 'node:stream';

export const TEST_ACCESS_CODE = 'test-access-code';

/** In-memory StoragePort adapter: makes the storage seam real and testable. */
export class FakeStorage implements StoragePort {
  readonly bucket = 'test-bucket';
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  async ensureBucket() {}
  async putObject({ key, body, contentType }: { key: string; body: Buffer; contentType: string }) {
    this.objects.set(key, { body, contentType });
    return { etag: `"${key.length}"` };
  }
  async getObject(key: string): Promise<StoredObject> {
    const object = this.objects.get(key);
    if (!object) throw new Error(`object not found: ${key}`);
    return {
      body: Readable.from(object.body),
      contentType: object.contentType,
      contentLength: object.body.length,
      etag: `"${object.body.length}"`,
    };
  }
  async copyObject(sourceKey: string, destinationKey: string) {
    const source = this.objects.get(sourceKey);
    if (!source) throw new Error(`object not found: ${sourceKey}`);
    this.objects.set(destinationKey, { ...source });
  }
  async deleteObject(key: string) {
    this.objects.delete(key);
  }
  async health() {}
  close() {}
}

export async function createTestDatabase(): Promise<DatabaseHandle> {
  const client = new PGlite();
  // Resolve relative to this file so the tests work from any working directory.
  const migrationsDir = fileURLToPath(new URL('../../drizzle/', import.meta.url));

  for (const file of readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) await client.exec(statement);
    }
  }

  const db = drizzle(client, { schema });
  return {
    db: db as unknown as DatabaseHandle['db'],
    pool: client as unknown as DatabaseHandle['pool'],
    async close() {
      await client.close();
    },
  };
}

export async function buildTestServer() {
  const database = await createTestDatabase();
  const storage = new FakeStorage();
  const app = await buildServer({
    database,
    storage,
    authConfig: {
      accessCodeHash: await createAccessCodeHash(TEST_ACCESS_CODE),
      cookieSecure: false,
    },
  });

  return {
    app,
    storage,
    async close() {
      await app.close();
    },
  };
}

/** Minimal multipart body builder for the asset upload endpoint. */
export function multipartBody(
  fields: Record<string, string>,
  file: { field: string; filename: string; contentType: string; content: Buffer },
) {
  const boundary = `----pagehush-test-${Date.now()}`;
  const parts: Buffer[] = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }

  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
    ),
    file.content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );

  return {
    payload: Buffer.concat(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}
