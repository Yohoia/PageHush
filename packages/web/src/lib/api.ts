export interface ApiCategory {
  id: string;
  name: string;
  articleCount: number;
}

export interface ApiTag {
  id: string;
  name: string;
  articleCount: number;
}

export interface ApiArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  format: 'md' | 'mdx';
  status: 'draft' | 'scheduled' | 'published' | 'trashed';
  category: string | null;
  categoryId: string | null;
  tags: string[];
  image: string | null;
  coverAssetId: string | null;
  readingTime: string;
  date: string;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiAsset {
  id: string;
  objectKey: string;
  originalName: string | null;
  mimeType: string;
  size: number;
  checksum: string;
  kind: 'cover' | 'inline_image' | 'attachment';
  status: 'uploading' | 'ready' | 'deleted';
  url: string;
}

export interface AuthSession {
  authenticated: boolean;
  expiresAt?: string;
  remember?: boolean;
}

export interface ArticleSavePayload {
  title: string;
  excerpt?: string;
  content?: string;
  format?: 'md' | 'mdx';
  status?: 'draft' | 'scheduled' | 'published' | 'trashed';
  categoryName?: string;
  categoryId?: string | null;
  coverAssetId?: string | null;
  tagNames?: string[];
}

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init?.headers,
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const code =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `http_${response.status}`;
    throw new ApiError(response.status, code);
  }

  return payload as T;
}

export function getAuthSession() {
  return request<AuthSession>('/v1/auth/session');
}

export function loginWithAccessCode(accessCode: string, remember: boolean) {
  return request<AuthSession>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ accessCode, remember }),
  });
}

export function logout() {
  return request<void>('/v1/auth/logout', { method: 'DELETE' });
}

export function listArticles() {
  return request<ApiArticle[]>('/v1/articles');
}

export function getArticle(id: string) {
  return request<ApiArticle>(`/v1/articles/${id}`);
}

export function createArticle(payload: ArticleSavePayload) {
  return request<ApiArticle>('/v1/articles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateArticle(id: string, payload: ArticleSavePayload) {
  return request<ApiArticle>(`/v1/articles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function listCategories() {
  return request<ApiCategory[]>('/v1/categories');
}

export function createCategory(name: string) {
  return request<ApiCategory>('/v1/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function deleteCategory(id: string, moveToCategoryId?: string) {
  const query = moveToCategoryId ? `?moveToCategoryId=${encodeURIComponent(moveToCategoryId)}` : '';
  return request<void>(`/v1/categories/${id}${query}`, { method: 'DELETE' });
}

export function listTags() {
  return request<ApiTag[]>('/v1/tags');
}

export function uploadCover(file: File) {
  const form = new FormData();
  form.append('file', file);
  form.append('kind', 'cover');

  return request<ApiAsset>('/v1/assets', {
    method: 'POST',
    body: form,
  });
}
