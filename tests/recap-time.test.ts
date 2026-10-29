import { describe, expect, it } from 'vitest';
import { formatTimeOfDay, minutesOfDay, parseTimeOfDay } from '../server/lib/time.js';

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
