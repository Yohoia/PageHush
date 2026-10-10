export interface ApiTopic {
  id: string;
  name: string;
  articleCount: number;
}

export interface ApiTag {
  id: string;
  name: string;
  articleCount: number;
}

export type ApiClipType =
  | 'article'
  | 'selection'
  | 'bookmark'
  | 'screenshot'
  | 'simplified'
  | 'full_page'
  | 'pdf'
  | 'email';

export interface ApiArticle {
  id: string;
  shortId?: string | null;
  slug: string;
  title: string;
  description: string;
  content: string;
  format: 'md' | 'mdx';
  status: 'draft' | 'published';
  language: 'zh' | 'en';
  author: string | null;
  sourceUrl?: string | null;
  sourceSiteName?: string | null;
  sourceSiteIconUrl?: string | null;
  sourcePublishedAt?: string | null;
  clipType?: ApiClipType | null;
  wordCount?: number | null;
  readingTimeMinutes?: number | null;
  sourceChecksum?: string | null;
  topic: string | null;
  topicId: string | null;
  tags: string[];
  cover: string | null;
  coverAssetId: string | null;
  coverAlt: string | null;
  publishedAt: string;
  updatedAt: string | null;
  recordCreatedAt: string;
  recordUpdatedAt: string;
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
  sourceUrl?: string | null;
  sourceSiteName?: string | null;
  sourceSiteIconUrl?: string | null;
  sourcePublishedAt?: string | null;
  clipType?: ApiClipType | null;
  wordCount?: number | null;
  readingTimeMinutes?: number | null;
  sourceChecksum?: string | null;
  slug?: string;
  description?: string;
  content?: string;
  format?: 'md' | 'mdx';
  status?: 'draft' | 'published';
  language?: 'zh' | 'en';
  author?: string | null;
  publishedAt?: string;
  updatedAt?: string | null;
  topicName?: string;
  topicId?: string | null;
  coverAssetId?: string | null;
  cover?: string | null;
  coverAlt?: string | null;
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

export function getArticle(slug: string) {
  return request<ApiArticle>(`/v1/articles/${encodeURIComponent(slug)}`);
}

export function createArticle(payload: ArticleSavePayload) {
  return request<ApiArticle>('/v1/articles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateArticle(slug: string, payload: Partial<ArticleSavePayload>) {
  return request<ApiArticle>(`/v1/articles/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteArticle(slug: string) {
  return request<void>(`/v1/articles/${encodeURIComponent(slug)}`, { method: 'DELETE' });
}

export function listTopics() {
  return request<ApiTopic[]>('/v1/topics');
}

export function createTopic(name: string) {
  return request<ApiTopic>('/v1/topics', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function deleteTopic(id: string, moveToTopicId?: string) {
  const query = moveToTopicId ? `?moveToTopicId=${encodeURIComponent(moveToTopicId)}` : '';
  return request<void>(`/v1/topics/${id}${query}`, { method: 'DELETE' });
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
