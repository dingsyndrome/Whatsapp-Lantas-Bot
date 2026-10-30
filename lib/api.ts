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

function copyWithTextarea(text: string): boolean {
  // Dialog Radix memasang focus trap: textarea yang ditempel ke <body> akan
  // kehilangan fokus sebelum execCommand('copy') selesai. Karena itu tempel
  // ke dalam elemen dialog bila ada, supaya fokus tetap di dalam trap.
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  const host = dialog ?? document.body;
  const previousFocus = document.activeElement as HTMLElement | null;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.tabIndex = -1;
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.padding = '0';
  textarea.style.border = 'none';
  textarea.style.outline = 'none';
  textarea.style.boxShadow = 'none';
  textarea.style.background = 'transparent';
  textarea.style.opacity = '0';
  textarea.style.fontSize = '12pt';
  host.appendChild(textarea);

  let ok = false;
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  } finally {
    textarea.remove();
    previousFocus?.focus?.({ preventScroll: true });
  }
  return ok;
}

function copyDialogPreview(text: string): boolean {
  // Fallback terakhir: pilih langsung elemen <pre> pratinjau di dalam dialog
  // (fokus tidak berpindah, jadi focus trap Radix tidak mengganggu).
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  const preview = dialog?.querySelector('pre');
  const selection = document.getSelection();
  if (!preview || !selection) return false;
  if ((preview.textContent ?? '').trim() !== text.trim()) return false;

  const range = document.createRange();
  range.selectNodeContents(preview);
  selection.removeAllRanges();
  selection.addRange(range);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  selection.removeAllRanges();
  return ok;
}

export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;

  // Jalur utama hanya tersedia pada secure context (HTTPS/localhost).
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // jatuh ke fallback di bawah
    }
  }

  if (copyWithTextarea(text)) return true;
  return copyDialogPreview(text);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Terjadi kesalahan.';
}
