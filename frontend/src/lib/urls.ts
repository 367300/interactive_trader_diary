import { API_BASE_URL } from '../api/client';

const STATIC_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

export function staticUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${STATIC_BASE_URL}${path}`;
}
