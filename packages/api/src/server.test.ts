import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from './server.js';

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalMinioEndpoint = process.env.MINIO_ENDPOINT;

describe('API server', () => {
  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }

    if (originalMinioEndpoint === undefined) {
      delete process.env.MINIO_ENDPOINT;
    } else {
      process.env.MINIO_ENDPOINT = originalMinioEndpoint;
    }
  });

  it('returns basic health information without persistence services', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.MINIO_ENDPOINT;

    const app = await buildServer();
    const response = await app.inject({ method: 'GET', url: '/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      service: 'pagehush-api',
    });

    await app.close();
  });

  it('reports persistence services as not configured', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.MINIO_ENDPOINT;

    const app = await buildServer();
    const response = await app.inject({ method: 'GET', url: '/v1/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      ready: false,
      checks: {
        api: 'ok',
        database: 'not_configured',
        storage: 'not_configured',
      },
    });

    await app.close();
  });
});
