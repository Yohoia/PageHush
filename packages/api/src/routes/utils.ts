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

export function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === '23505',
  );
}
