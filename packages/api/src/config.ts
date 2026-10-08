export interface DatabaseConfig {
  url: string;
}

export interface AuthConfig {
  accessCodeHash: string;
  cookieSecure: boolean;
}

export interface StorageConfig {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region?: string;
  forcePathStyle: boolean;
}

export function readDatabaseConfig(): DatabaseConfig | null {
  const url = process.env.DATABASE_URL?.trim();
  return url ? { url } : null;
}

export function readAuthConfig(): AuthConfig | null {
  const accessCodeHash = process.env.PAGEHUSH_ACCESS_CODE_HASH?.trim();

  if (!accessCodeHash) return null;

  return {
    accessCodeHash,
    cookieSecure: process.env.PAGEHUSH_COOKIE_SECURE === 'true',
  };
}

export function readStorageConfig(): StorageConfig | null {
  const endpoint = process.env.MINIO_ENDPOINT?.trim();
  const bucket = process.env.MINIO_BUCKET?.trim();
  const accessKey = process.env.MINIO_ACCESS_KEY?.trim();
  const secretKey = process.env.MINIO_SECRET_KEY?.trim();

  if (!endpoint || !bucket || !accessKey || !secretKey) {
    return null;
  }

  return {
    endpoint,
    bucket,
    accessKey,
    secretKey,
    region: process.env.MINIO_REGION?.trim() || undefined,
    forcePathStyle: process.env.MINIO_FORCE_PATH_STYLE !== 'false',
  };
}

export const MAX_ASSET_FILE_SIZE = 5 * 1024 * 1024;
export const ALLOWED_ASSET_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
