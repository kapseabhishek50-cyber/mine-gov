import { handleStaticRequest, isStaticModeForced, enableStaticMode } from './staticStore';

const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const STATIC_ENV = (import.meta.env.VITE_STATIC_MODE || '').toLowerCase();
const FORCE_STATIC = STATIC_ENV === 'true';

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status = 500, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

// Track if we have switched to static mode after a network failure
let staticModeActive = false;

function shouldUseStatic(): boolean {
  if (FORCE_STATIC) return true;
  if (staticModeActive) return true;
  try {
    if (isStaticModeForced()) {
      staticModeActive = true;
      return true;
    }
  } catch {}
  // If no API URL configured and in production build (Netlify/Vercel static hosting), use static
  if (typeof window !== 'undefined') {
    if (import.meta.env.PROD && !base) return true;
  }
  return false;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  // If static mode is active, bypass network
  if (shouldUseStatic()) {
    try {
      const result = await handleStaticRequest(path, options);
      return result as T;
    } catch (err: any) {
      const status = err.status || 500;
      if (status === 401 && path !== '/auth/login') {
        localStorage.removeItem('minegov_token');
        window.dispatchEvent(new CustomEvent('minegov:session-expired'));
      }
      throw new ApiError(err.message || 'Static request failed', status, err.details);
    }
  }

  const token = localStorage.getItem('minegov_token');
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${base}/api${path}`, { ...options, headers });
  } catch {
    // Network failure -> switch to static mode automatically for static deployment
    console.warn('API unreachable, switching to static demo mode');
    enableStaticMode();
    staticModeActive = true;
    try {
      const result = await handleStaticRequest(path, options);
      return result as T;
    } catch (err: any) {
      throw new ApiError(err.message || 'Unable to reach MineGov services. Running in static demo mode.', err.status || 0);
    }
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // If API returns 404/502 for /api routes in static hosting, fallback to static mode
    if (response.status === 404 || response.status === 502 || response.status === 503) {
      const isApiRoute = path.startsWith('/auth') || path.startsWith('/mines') || path.startsWith('/compliances') || path.startsWith('/dashboard') || path.startsWith('/violations') || path.startsWith('/actions') || path.startsWith('/alerts') || path.startsWith('/users') || path.startsWith('/inspections');
      if (isApiRoute) {
        console.warn(`API returned ${response.status} for ${path}, switching to static mode`);
        enableStaticMode();
        staticModeActive = true;
        try {
          const result = await handleStaticRequest(path, options);
          return result as T;
        } catch (err: any) {
          // fall through to throw original error if static also fails
        }
      }
    }

    if (response.status === 401 && path !== '/auth/login') {
      localStorage.removeItem('minegov_token');
      window.dispatchEvent(new CustomEvent('minegov:session-expired'));
    }
    const message = data.error || data.message || 'The request could not be completed.';
    throw new ApiError(message, response.status, data.details);
  }
  return data as T;
}

export async function downloadEvidence(file: { name: string; url?: string }) {
  // In static mode, allow demo evidence download as text file
  if (shouldUseStatic() || file.url === '/demo-evidence.txt' || file.url?.startsWith('/demo')) {
    const content = `MINEGOV AI · DEMO EVIDENCE

This sample evidence file is for product demonstration only.
It does not represent a real statutory record or mine inspection.

File: ${file.name}
Generated: ${new Date().toISOString()}
Mode: Static Demo
`;
    const blob = new Blob([content], { type: 'text/plain' });
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = file.name || 'minegov-evidence.txt';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    return;
  }

  if (!file.url || !/^\/api\/uploads\/files\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?$/.test(file.url))
    throw new ApiError('This record does not reference a valid MineGov evidence file.', 404);
  const token = localStorage.getItem('minegov_token');
  const response = await fetch(`${base}${file.url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new ApiError('Evidence could not be downloaded. Your session may have expired.', response.status);
  const blobUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = file.name || 'minegov-evidence';
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  put: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  upload: async (files: FileList | File[]) => {
    if (shouldUseStatic()) {
      // Mock upload in static mode
      return handleStaticRequest('/uploads', { method: 'POST' }) as Promise<{ files: { name: string; url: string; size: number; uploadedAt: string }[] }>;
    }
    const form = new FormData();
    Array.from(files).forEach((file) => form.append('files', file));
    return request<{ files: { name: string; url: string; size: number; uploadedAt: string }[] }>('/uploads', { method: 'POST', body: form });
  },
  isStaticMode: () => shouldUseStatic(),
  enableStatic: () => {
    enableStaticMode();
    staticModeActive = true;
  },
};

export const formatDate = (value?: string | Date, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-IN', options).format(date);
};
export const formatRelative = (value?: string) => {
  if (!value) return '—';
  const hours = Math.round((new Date(value).getTime() - Date.now()) / 3600000);
  const absolute = Math.abs(hours);
  if (absolute < 24) return hours < 0 ? `${absolute}h overdue` : `in ${absolute}h`;
  const days = Math.round(absolute / 24);
  return hours < 0 ? `${days}d overdue` : `in ${days}d`;
};
export const humanize = (value?: string) => (value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
export const initials = (value?: string) => (value || 'MG').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
