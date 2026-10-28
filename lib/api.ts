export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers
    }
  });

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? ((await response.json()) as { error?: string; details?: unknown })
    : await response.text();

  if (!response.ok) {
    const message =
      typeof body === 'object' && body && 'error' in body
        ? String(body.error)
        : `Permintaan gagal (${response.status})`;
    const details = typeof body === 'object' && body && 'details' in body ? body.details : undefined;
    throw new ApiError(response.status, message, details);
  }

  return body as T;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body)
    });
  },
  put<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
  },
  patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  },
  delete<T = void>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' });
  },
  upload<T>(path: string, form: FormData): Promise<T> {
    return request<T>(path, { method: 'POST', body: form });
  }
};

export function exportUrl(
  kind:
    | 'daily.xlsx'
    | 'daily.txt'
    | 'links.csv'
    | 'timemark.csv'
    | 'sprin.csv'
    | 'turjawali.csv',
  date?: string
): string {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  return `/api/exports/${kind}${query}`;
}

export function downloadFile(url: string, filename?: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename ?? '';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Terjadi kesalahan.';
}
