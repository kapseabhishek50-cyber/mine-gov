const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status = 500, details?: unknown) { super(message); this.name = 'ApiError'; this.status = status; this.details = details; }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('minegov_token');
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try { response = await fetch(`${base}/api${path}`, { ...options, headers }); }
  catch { throw new ApiError('Unable to reach MineGov services. Check your connection and try again.', 0); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
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
  if (!file.url || !/^\/api\/uploads\/files\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?$/.test(file.url)) throw new ApiError('This record does not reference a valid MineGov evidence file.', 404);
  const token = localStorage.getItem('minegov_token');
  const response = await fetch(`${base}${file.url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new ApiError('Evidence could not be downloaded. Your session may have expired.', response.status);
  const blobUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a'); anchor.href = blobUrl; anchor.download = file.name || 'minegov-evidence'; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  put: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  upload: async (files: FileList | File[]) => {
    const form = new FormData();
    Array.from(files).forEach((file) => form.append('files', file));
    return request<{ files: { name: string; url: string; size: number; uploadedAt: string }[] }>('/uploads', { method: 'POST', body: form });
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
