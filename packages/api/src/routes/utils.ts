import { randomBytes } from 'node:crypto';

export function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function slugify(value: string, fallbackPrefix = 'item') {
  const normalized = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  if (normalized) return normalized;
  return `${fallbackPrefix}-${randomBytes(4).toString('hex')}`;
}

export function uniqueSlugSuffix() {
  return randomBytes(3).toString('hex');
}

function hasUniqueConstraintCode(value: unknown) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'code' in value &&
    (value as { code?: unknown }).code === '23505',
  );
}

export function isUniqueConstraintError(error: unknown) {
  if (hasUniqueConstraintCode(error)) return true;

  // Drizzle wraps driver errors in DrizzleQueryError; the pg code lives on `cause`.
  return Boolean(
    error &&
    typeof error === 'object' &&
    'cause' in error &&
    hasUniqueConstraintCode((error as { cause?: unknown }).cause),
  );
}
