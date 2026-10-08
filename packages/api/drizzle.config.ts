import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(new URL('../../.env', import.meta.url));
  } catch {
    // .env is optional; CI can provide DATABASE_URL directly.
  }
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/pagehush',
  },
  verbose: true,
  strict: true,
});
