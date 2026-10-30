/**
 * Utilitas jam untuk filter rentang waktu rekap.
 *
 * Input pengguna bisa berupa "7", "07", "07:15", "7.15", atau "07.15";
 * semuanya dikonversi ke menit sejak 00:00 agar perbandingan konsisten
 * sampai tingkat menit.
 */

import { endOfDay, startOfDay } from 'date-fns';

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

export interface AbsoluteTimeRange {
  /** Batas awal absolut: jam mulai pada tanggal `from`. */
  start: Date;
  /** Batas akhir absolut: jam selesai pada tanggal `to`. */
  end: Date;
}

/**
 * Rentang waktu absolut untuk filter rekap.
 *
 * Jam mulai selalu menempel pada tanggal `from`, jam selesai pada tanggal `to`.
 * Jadi rentang lintas hari seperti 29 Okt 13:36 → 30 Okt 08:26 tetap valid
 * walaupun jam selesainya lebih kecil dari jam mulai.
 */
export function resolveTimeRange(
  from: string,
  to: string,
  startMinutes: number | null | undefined,
  endMinutes: number | null | undefined
): AbsoluteTimeRange {
  const start = startOfDay(new Date(`${from}T00:00:00`));
  if (typeof startMinutes === 'number') {
    start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  }

  const end = endOfDay(new Date(`${to}T00:00:00`));
  if (typeof endMinutes === 'number') {
    end.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 59, 999);
  }

  return { start, end };
}

/**
 * Apakah urutan jam masuk akal?
 *
 * Jam selesai lebih kecil dari jam mulai hanya sah bila tanggalnya berbeda
 * (rentang melewati tengah malam). Pada tanggal yang sama, hasilnya kosong,
 * jadi lebih baik ditolak dengan pesan jelas.
 */
export function isTimeRangeOrderValid(
  from: string,
  to: string,
  startMinutes: number | null | undefined,
  endMinutes: number | null | undefined
): boolean {
  if (typeof startMinutes !== 'number' || typeof endMinutes !== 'number') return true;
  if (from !== to) return true;
  return startMinutes <= endMinutes;
}
