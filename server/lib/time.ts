/**
 * Utilitas jam untuk filter rentang waktu rekap.
 *
 * Input pengguna bisa berupa "7", "07", "07:15", "7.15", atau "07.15";
 * semuanya dikonversi ke menit sejak 00:00 agar perbandingan konsisten
 * sampai tingkat menit.
 */

const TIME_OF_DAY_PATTERN = /^([01]?\d|2[0-3])(?:[:.]([0-5]\d))?$/;

export interface TimeOfDay {
  hour: number;
  minute: number;
  /** Menit sejak 00:00, mis. 07:15 → 435. */
  minutes: number;
}

/** Ubah teks jam menjadi menit sejak 00:00, atau null bila formatnya tidak dikenali. */
export function parseTimeOfDay(value: string | null | undefined): TimeOfDay | null {
  if (!value) return null;
  const match = value.trim().match(TIME_OF_DAY_PATTERN);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  return { hour, minute, minutes: hour * 60 + minute };
}

/** Ubah menit sejak 00:00 menjadi "HH:MM". */
export function formatTimeOfDay(minutes: number | null | undefined): string | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return null;
  const clamped = Math.min(Math.max(Math.round(minutes), 0), 23 * 60 + 59);
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/** Menit sejak 00:00 untuk sebuah Date (memakai zona waktu lokal server). */
export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}
