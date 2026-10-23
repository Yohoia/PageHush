import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createDatabase, type DatabaseHandle } from '../db/client.js';

/** Explicit loopback test databases only. Production configuration is never read. */
export async function createPostgresTestDatabase(connection: string): Promise<DatabaseHandle> {
  const url = new URL(connection);
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !url.pathname.startsWith('/yoho_test')
  )
    throw new Error('A dedicated local yoho_test database is required');
  const namespace = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = createDatabase(connection);
  await admin.pool.query(`CREATE SCHEMA "${namespace}"`);
  url.searchParams.set('options', `-csearch_path=${namespace},public`);
  const database = createDatabase(url.toString());
  try {
    const migrationsDir = fileURLToPath(new URL('../../drizzle/', import.meta.url));
    for (const name of readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      await database.pool.query(
        readFileSync(join(migrationsDir, name), 'utf8').replaceAll('"public".', `"${namespace}".`),
      );
    }
  } catch (error) {
    await database.close();
    await admin.pool.query(`DROP SCHEMA "${namespace}" CASCADE`);
    await admin.close();
    throw error;
  }
  return {
    db: database.db,
    pool: database.pool,
    async close() {
      await database.close();
      await admin.pool.query(`DROP SCHEMA "${namespace}" CASCADE`);
      await admin.close();
    },
  };
}
