const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:8000/api';

const ACCESS_KEY = 'td_access';
const REFRESH_KEY = 'td_refresh';

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh?: string) {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, data: unknown, message?: string) {
    super(message || `HTTP ${status}`);
    this.status = status;
    this.data = data;
  }
}

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = tokenStore.refresh;
  if (!refresh) return null;
  if (!refreshing) {
    refreshing = fetch(`${API_BASE_URL}/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    })
      .then(async (r) => {
        if (!r.ok) {
          tokenStore.clear();
          return null;
        }
        const data = (await r.json()) as { access: string };
        tokenStore.set(data.access, refresh);
        return data.access;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

interface RequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | undefined | null>;
  isFormData?: boolean;
  raw?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {},
  retry = true,
): Promise<T> {
  const { body, headers = {}, query, isFormData, raw, ...rest } = options;
  const init: RequestInit = { ...rest, headers: { ...headers } };

  if (body !== undefined) {
    if (isFormData) {
      init.body = body as BodyInit;
    } else {
      (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
  }
  const access = tokenStore.access;
  if (access) {
    (init.headers as Record<string, string>).Authorization = `Bearer ${access}`;
  }

  const response = await fetch(buildUrl(path, query), init);

  if (response.status === 401 && retry && tokenStore.refresh) {
    const newAccess = await refreshAccessToken();
    if (newAccess) return apiFetch<T>(path, options, false);
    tokenStore.clear();
  }

  if (raw) return response as unknown as T;

  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const text = await response.text();
  const data = text ? safeJson(text) : null;

  if (!response.ok) {
    throw new ApiError(response.status, data, extractMessage(data) || `HTTP ${response.status}`);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const obj = data as Record<string, unknown>;
  if (typeof obj.detail === 'string') return obj.detail;
  const first = Object.values(obj)[0];
  if (Array.isArray(first) && first.length && typeof first[0] === 'string') return first[0] as string;
  return undefined;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
};

export { API_BASE_URL };