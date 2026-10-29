import { describe, expect, it } from 'vitest';
import { findPhone, normalizePhone } from '../server/lib/phone.js';
import { parseLampiranRow } from '../server/services/documents/sprin-parser.js';

describe('nomor HP personel dari lampiran Sprin', () => {
  it('mengambil nomor dari teks KET lampiran', () => {
    expect(findPhone('08113671001 nomor hp')).toBe('628113671001');
    expect(findPhone('082336422497 nomor hp')).toBe('6282336422497');
    expect(findPhone('081334128153')).toBe('6281334128153');
  });

  it('mengabaikan teks tanpa nomor HP', () => {
    expect(findPhone('SIMP 3 GOLDEN')).toBeNull();
    expect(findPhone(null)).toBeNull();
  });

  it('menormalkan nomor dengan spasi/tanda hubung', () => {
    expect(normalizePhone('0811-3671-001')).toBe('628113671001');
    expect(findPhone('HP: +62 811 3671 001')).toBe('628113671001');
  });

  it('baris lampiran tetap menyimpan nomor pada kolom KET', () => {
    const row = parseLampiranRow(
      '4. HERIYANTO AIPTU 08113671001',
      1
    );
    // Nama & pangkat terbaca; nomor dapat diambil dari rawText baris.
    expect(row?.name).toBe('HERIYANTO');
    expect(row?.rank).toBe('AIPTU');
    expect(findPhone(row?.rawText)).toBe('628113671001');
  });
});
