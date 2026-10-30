import { describe, expect, it } from 'vitest';
import { resolveTimeRange } from '../server/lib/time.js';

describe('resolveTimeRange timezone handling', () => {
  // Asia/Jakarta (UTC+7)
  it('menghasilkan batas awal dan akhir yang benar untuk rentang lintas hari', () => {
    const range = resolveTimeRange('2026-10-29', '2026-10-30', 13 * 60 + 36, 8 * 60 + 26);

    // queryStart = 29 Okt 13:36 Jakarta = 29 Okt 06:36 UTC
    expect(range.start.toISOString().startsWith('2026-10-29T06:36:00')).toBe(true);
    // queryEnd = 30 Okt 08:26 Jakarta = 30 Okt 01:26 UTC
    expect(range.end.toISOString().startsWith('2026-10-30T01:26:59')).toBe(true);
  });

  it('link yang dikirim 19:27 Jakarta termasuk dalam rentang', () => {
    const range = resolveTimeRange('2026-10-29', '2026-10-29', 0, 23 * 60 + 59);
    const linkTime = new Date('2026-10-29T19:27:00+07:00');

    expect(linkTime >= range.start && linkTime <= range.end).toBe(true);
  });

  it('link yang dikirim 18:51-20:03 Jakarta termasuk dalam rentang 29 Okt', () => {
    const range = resolveTimeRange('2026-10-29', '2026-10-29', 0, 23 * 60 + 59);
    const testTimes = [
      '2026-10-29T18:51:00+07:00',
      '2026-10-29T19:22:00+07:00',
      '2026-10-29T19:27:00+07:00',
      '2026-10-29T19:42:00+07:00',
      '2026-10-29T20:03:00+07:00'
    ];

    for (const time of testTimes) {
      expect(new Date(time) >= range.start && new Date(time) <= range.end).toBe(true);
    }
  });
});
