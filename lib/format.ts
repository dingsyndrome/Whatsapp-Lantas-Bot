import { format, formatDistanceToNow } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

export function formatDate(value: string | Date | null | undefined, pattern = 'dd MMM yyyy'): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return format(date, pattern, { locale: localeId });
}

export function formatDateLong(value: string | Date | null | undefined): string {
  return formatDate(value, 'EEEE, dd MMMM yyyy');
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, 'dd MMM yyyy · HH:mm');
}

export function formatTime(value: string | Date | null | undefined): string {
  return formatDate(value, 'HH:mm');
}

const TIME_INPUT_PATTERN = /^([01]?\d|2[0-3])(?:[:.]([0-5]\d))?$/;

/**
 * Normalisasi input jam pengguna menjadi "HH:MM" 24 jam.
 * Menerima "7", "07", "7.15", "07.15", dan "07:15".
 * Mengembalikan '' untuk input kosong dan null bila format tidak dikenali.
 */
export function normalizeTimeInput(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(TIME_INPUT_PATTERN);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return formatDistanceToNow(date, { addSuffix: true, locale: localeId });
}

export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat('id-ID').format(value ?? 0);
}

export function formatCompact(value: number | null | undefined): string {
  return new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value ?? 0
  );
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 19) return 'Selamat sore';
  return 'Selamat malam';
}

export function dayLabel(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return format(date, 'EEE', { locale: localeId });
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export function truncate(value: string | null | undefined, length: number): string {
  if (!value) return '-';
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    parsed: 'Terverifikasi',
    review: 'Perlu review',
    failed: 'Gagal OCR',
    valid: 'Valid',
    invalid: 'Tidak valid',
    restricted: 'Dibatasi',
    unchecked: 'Belum dicek',
    active: 'Aktif',
    completed: 'Selesai',
    archived: 'Diarsipkan',
    connected: 'Terhubung',
    disconnected: 'Terputus',
    connecting: 'Menghubungkan',
    qr: 'Scan QR',
    authenticated: 'Tersinkron',
    error: 'Error',
    mock: 'Simulasi'
  };
  return labels[status] ?? status;
}
