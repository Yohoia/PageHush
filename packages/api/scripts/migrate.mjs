import console from 'node:console';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
  console.error('DATABASE_URL is required to run database migrations.');
  process.exitCode = 1;
} else {
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000 });
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['pagehush:database-migrations']);
    await migrate(drizzle(client), {
      migrationsFolder: fileURLToPath(new URL('../drizzle/', import.meta.url)),
    });
    console.info('Database migrations completed.');
  } catch {
    console.error('Database migration failed. Check database access and migration files.');
    process.exitCode = 1;
  } finally {
    client?.release();
    await pool.end();
  }
}
