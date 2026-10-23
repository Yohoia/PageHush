import type {
  ArticleListItemResponse,
  ArticleResponse,
  AssetResponse,
  AuthLoginResponse,
  AuthSessionResponse,
  CreateArticleBody,
  DeviceListResponse,
  DeviceVerificationBody,
  DeviceVerificationResponse,
  TagResponse,
  TopicResponse,
} from '@pagehush/shared';

export type ApiTopic = TopicResponse;
export type ApiTag = TagResponse;
export type ApiClipType = NonNullable<ArticleResponse['clipType']>;
export type ApiArticle = ArticleResponse;
/** List responses omit article content; only the detail endpoint is guaranteed to include it. */
export type ApiArticleListItem = ArticleListItemResponse;
export type ApiAsset = AssetResponse;

export type AuthSession = AuthSessionResponse;
export type AuthLoginResult = AuthLoginResponse;

export type ArticleSavePayload = CreateArticleBody;

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

// Authentication relies on the same-origin session cookie (Vite proxies /v1 in development).
// If API_BASE_URL is ever pointed at another origin, credentials and CORS must be configured.
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
  return request<AuthLoginResult>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ accessCode, remember }),
  });
}

export function logout() {
  return request<void>('/v1/auth/logout', { method: 'DELETE' });
}

export function getDeviceVerification(userCode: string) {
  const query = new URLSearchParams({ user_code: userCode });
  return request<DeviceVerificationResponse>(`/v1/auth/device/verify?${query}`);
}

export function verifyDevice(payload: DeviceVerificationBody) {
  return request<DeviceVerificationResponse>('/v1/auth/device/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listDevices() {
  return request<DeviceListResponse>('/v1/auth/devices');
}

export function revokeDevice(id: string) {
  return request<void>(`/v1/auth/devices/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

const LIST_PAGE_SIZE = 200;
const MAX_LIST_PAGES = 20;

export async function listArticles() {
  const articles: ApiArticleListItem[] = [];

  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const params = new URLSearchParams({
      limit: String(LIST_PAGE_SIZE),
      offset: String(page * LIST_PAGE_SIZE),
    });
    const data = await request<ApiArticleListItem[]>(`/v1/articles?${params}`);
    articles.push(...data);
    if (data.length < LIST_PAGE_SIZE) break;
  }

  return articles;
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

export function updateArticle(
  slug: string,
  payload: Partial<ArticleSavePayload>,
  revision: ApiArticle['revision'],
) {
  return request<ApiArticle>(`/v1/articles/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: { 'If-Match': revision },
    body: JSON.stringify(payload),
  });
}

export function deleteArticle(slug: string, revision: ApiArticle['revision']) {
  return request<void>(`/v1/articles/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    headers: { 'If-Match': revision },
  });
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
