import { describe, expect, it } from 'vitest';
import {
  formatTimeOfDay,
  isTimeRangeOrderValid,
  minutesOfDay,
  parseTimeOfDay,
  resolveTimeRange
} from '../server/lib/time.js';

describe('parseTimeOfDay', () => {
  it('menerima jam saja dan jam:menit', () => {
    expect(parseTimeOfDay('7')).toEqual({ hour: 7, minute: 0, minutes: 420 });
    expect(parseTimeOfDay('07')).toEqual({ hour: 7, minute: 0, minutes: 420 });
    expect(parseTimeOfDay('07:15')).toEqual({ hour: 7, minute: 15, minutes: 435 });
    expect(parseTimeOfDay(' 5:00 ')).toEqual({ hour: 5, minute: 0, minutes: 300 });
    expect(parseTimeOfDay('23:59')).toEqual({ hour: 23, minute: 59, minutes: 1439 });
  });

  it('menerima pemisah titik seperti kebiasaan penulisan jam Indonesia', () => {
    expect(parseTimeOfDay('07.15')?.minutes).toBe(435);
  });

  it('menolak format yang tidak dikenali', () => {
    for (const value of ['', '24:00', '07:60', '7:5', '07:15:00', 'jam 7', 'abc', '07,15', '-1']) {
      expect(parseTimeOfDay(value)).toBeNull();
    }
  });

  it('menangani nilai kosong', () => {
    expect(parseTimeOfDay('')).toBeNull();
    expect(parseTimeOfDay(null)).toBeNull();
    expect(parseTimeOfDay(undefined)).toBeNull();
  });
});

describe('formatTimeOfDay', () => {
  it('mengembalikan format HH:MM dua digit', () => {
    expect(formatTimeOfDay(435)).toBe('07:15');
    expect(formatTimeOfDay(300)).toBe('05:00');
    expect(formatTimeOfDay(0)).toBe('00:00');
    expect(formatTimeOfDay(1439)).toBe('23:59');
  });

  it('mengembalikan null untuk nilai yang tidak ada', () => {
    expect(formatTimeOfDay(null)).toBeNull();
    expect(formatTimeOfDay(undefined)).toBeNull();
    expect(formatTimeOfDay(Number.NaN)).toBeNull();
  });
});

describe('minutesOfDay', () => {
  it('menghitung menit sejak tengah malam', () => {
    expect(minutesOfDay(new Date(2026, 9, 29, 7, 15, 45))).toBe(435);
    expect(minutesOfDay(new Date(2026, 9, 29, 7, 20, 59))).toBe(440);
  });
});

describe('resolveTimeRange', () => {
  it('menempelkan jam mulai ke tanggal awal dan jam selesai ke tanggal akhir', () => {
    const range = resolveTimeRange('2026-10-29', '2026-10-30', 13 * 60 + 36, 8 * 60 + 26);

    expect(range.start).toEqual(new Date(2026, 9, 29, 13, 36, 0, 0));
    expect(range.end).toEqual(new Date(2026, 9, 30, 8, 26, 59, 999));
    expect(range.start.getTime()).toBeLessThan(range.end.getTime());
  });

  it('mendukung rentang lintas tengah malam pada tanggal yang berbeda', () => {
    const range = resolveTimeRange('2026-10-29', '2026-10-30', 22 * 60, 2 * 60);

    expect(range.start).toEqual(new Date(2026, 9, 29, 22, 0, 0, 0));
    expect(range.end).toEqual(new Date(2026, 9, 30, 2, 0, 59, 999));
    expect(range.start.getTime()).toBeLessThan(range.end.getTime());
  });

  it('memakai awal dan akhir hari bila jam dikosongkan', () => {
    const fullDay = resolveTimeRange('2026-10-29', '2026-10-29', null, null);
    expect(fullDay.start).toEqual(new Date(2026, 9, 29, 0, 0, 0, 0));
    expect(fullDay.end).toEqual(new Date(2026, 9, 29, 23, 59, 59, 999));

    const startOnly = resolveTimeRange('2026-10-29', '2026-10-29', 8 * 60, null);
    expect(startOnly.start).toEqual(new Date(2026, 9, 29, 8, 0, 0, 0));
    expect(startOnly.end).toEqual(new Date(2026, 9, 29, 23, 59, 59, 999));

    const endOnly = resolveTimeRange('2026-10-29', '2026-10-29', null, 9 * 60);
    expect(endOnly.start).toEqual(new Date(2026, 9, 29, 0, 0, 0, 0));
    expect(endOnly.end).toEqual(new Date(2026, 9, 29, 9, 0, 59, 999));
  });

  it('memakai akhir hari tujuan pada rentang beberapa hari tanpa jam selesai', () => {
    const range = resolveTimeRange('2026-10-29', '2026-10-30', 8 * 60, null);
    expect(range.start).toEqual(new Date(2026, 9, 29, 8, 0, 0, 0));
    expect(range.end).toEqual(new Date(2026, 9, 30, 23, 59, 59, 999));
  });
});

describe('isTimeRangeOrderValid', () => {
  it('menolak jam selesai lebih kecil pada tanggal yang sama', () => {
    expect(isTimeRangeOrderValid('2026-10-29', '2026-10-29', 8 * 60, 7 * 60)).toBe(false);
  });

  it('mengizinkan jam selesai lebih kecil bila tanggalnya berbeda', () => {
    expect(isTimeRangeOrderValid('2026-10-29', '2026-10-30', 13 * 60 + 36, 8 * 60 + 26)).toBe(true);
  });

  it('mengizinkan urutan jam yang wajar dan jam yang dikosongkan', () => {
    expect(isTimeRangeOrderValid('2026-10-29', '2026-10-29', 8 * 60, 9 * 60)).toBe(true);
    expect(isTimeRangeOrderValid('2026-10-29', '2026-10-29', 8 * 60, 8 * 60)).toBe(true);
    expect(isTimeRangeOrderValid('2026-10-29', '2026-10-29', null, 7 * 60)).toBe(true);
    expect(isTimeRangeOrderValid('2026-10-29', '2026-10-29', 8 * 60, null)).toBe(true);
  });
});
