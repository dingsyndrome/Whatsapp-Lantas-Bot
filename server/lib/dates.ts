import { addDays, format, startOfDay, subDays } from 'date-fns';

export function startOfToday(): Date {
  return startOfDay(new Date());
}

export function dayRange(day: Date): { start: Date; end: Date } {
  const start = startOfDay(day);
  return { start, end: addDays(start, 1) };
}

export function yesterdayRange(): { start: Date; end: Date } {
  return dayRange(subDays(new Date(), 1));
}

export function isoDay(day: Date): string {
  return format(day, 'yyyy-MM-dd');
}

export function lastNDays(n: number): Date[] {
  const today = startOfToday();
  return Array.from({ length: n }, (_, index) => subDays(today, n - 1 - index));
}

export function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateLong(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}
