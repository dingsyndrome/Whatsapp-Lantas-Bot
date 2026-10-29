import { describe, expect, it } from 'vitest';
import {
  analyzeSprinLocation,
  extractPersonnelTaskLocation,
  parseLocationDirectives,
  resolvePersonnelApelLocation
} from '../server/services/sprin-location.js';

const UNTUK_1848 =
  'di samping melaksanakan tugas dan jabatan sehari-hari, ditunjuk untuk melaksanakan pengamanan kegiatan audiensi / aksi dari Lembaga Advokasi dan Reforma Agraria ( Lembaara ) dengan pengawalan kelompok masyarakat Pejuang Tora di wilayah Kab. Tulungagung; ' +
  'pelaksanaan tugas hari Kamis tanggal 29 Oktober 2026 pukul 09.00 WIB s.d. Selesai, sebelum melaksanakan tugas Apel di halaman Kantor DPRD Kab. Tulungagung Pukul 08.00 WIB; ' +
  'a. tersebut nomor 1 s.d. 12 dan 26 s.d. 113 melaksanakan apel di halaman Pemkab Tulungagung Pukul 08.00 WIB, kecuali Pam Kejaksaan apel di lokasi Kantor Kejaksaan Kab. Tulungagung; ' +
  'b. tersebut nomor 13 s.d. 25 melaksanakan apel di halaman Polsek Boyolangu Pukul 08.00 WIB; ' +
  'pakaian Padal dan petugas Polri terbuka pakaian PDL II Two Tone tutup kepala field cap/baret, memakai rompi dan petugas tertutup pakaian bebas rapi menyesuaikan; ' +
  'melaksanakan perintah ini dengan seksama dan penuh rasa tanggung jawab. Selesai';

describe('sprin location parser', () => {
  it('reads both apel groups and the general apel verbatim', () => {
    const directives = parseLocationDirectives(UNTUK_1848);
    expect(directives).toHaveLength(2);
    expect(directives[0]?.ranges).toEqual([
      { from: 1, to: 12 },
      { from: 26, to: 113 }
    ]);
    expect(directives[0]?.location).toBe('halaman Pemkab Tulungagung');
    expect(directives[0]?.time).toBe('08.00 WIB');
    expect(directives[0]?.exception).toContain('Kantor Kejaksaan');
    expect(directives[1]?.location).toBe('halaman Polsek Boyolangu');

    const analysis = analyzeSprinLocation({ untuk: UNTUK_1848, place: 'Kantor Kejaksaan Kab. Tulungagung' });
    expect(analysis.preTaskApel?.location).toBe('halaman Kantor DPRD Kab. Tulungagung');
    expect(analysis.preTaskApel?.time).toBe('08.00 WIB');
    expect(analysis.schedule?.text).toBe('Kamis, 29 Oktober 2026, pukul 09.00 WIB s.d. Selesai');
    expect(analysis.place?.confidence).toBe('low');
    expect(analysis.ambiguous).toBe(true);
  });

  it('does not treat the metadata place as the main place when it is only an exception', () => {
    const analysis = analyzeSprinLocation({
      untuk: UNTUK_1848,
      place: 'Kantor Kejaksaan Kab. Tulungagung'
    });
    expect(analysis.place?.reason).toMatch(/pengecualian/i);
  });

  it('keeps the exact exception for personnel marked Kejaksaan and flags the rest', () => {
    const analysis = analyzeSprinLocation({ untuk: UNTUK_1848, place: null });
    const regular = resolvePersonnelApelLocation({
      no: 30,
      personnelText: 'BA SATLANTAS',
      analysis
    });
    expect(regular.value).toContain('halaman Pemkab Tulungagung');
    expect(regular.value).toContain('halaman Kantor DPRD Kab. Tulungagung');
    expect(regular.issue).toMatch(/pengecualian/i);

    const kejaksaan = resolvePersonnelApelLocation({
      no: 33,
      personnelText: 'BA SATLANTAS DEPAN KANTOR KEJAKSAAN',
      analysis
    });
    expect(kejaksaan.value).toContain('Kantor Kejaksaan Kab. Tulungagung');
    expect(kejaksaan.value).not.toContain('halaman Pemkab Tulungagung');
    expect(kejaksaan.issue).toBeNull();
  });

  it('uses the Polsek group for numbers 13-25', () => {
    const analysis = analyzeSprinLocation({ untuk: UNTUK_1848, place: null });
    const apel = resolvePersonnelApelLocation({
      no: 13,
      personnelText: 'BA POLSEK BOYOLANGU',
      analysis
    });
    expect(apel.value).toContain('halaman Polsek Boyolangu');
    expect(apel.value).toContain('halaman Kantor DPRD Kab. Tulungagung');
  });

  it('flags numbers outside every group when only a general apel exists', () => {
    const analysis = analyzeSprinLocation({ untuk: UNTUK_1848, place: null });
    const apel = resolvePersonnelApelLocation({
      no: 114,
      personnelText: 'BA POLSEK BOYOLANGU',
      analysis
    });
    expect(apel.value).toContain('halaman Kantor DPRD Kab. Tulungagung');
    expect(apel.issue).toMatch(/tidak termasuk/i);
  });

  it('extracts a per-person post from the Jabatan column and cuts row bleed', () => {
    expect(
      extractPersonnelTaskLocation({
        jabatan: 'BA SATLANTAS DEPAN SMPN 6 TULUNGAGUNG',
        ket: null
      }).value
    ).toBe('DEPAN SMPN 6 TULUNGAGUNG');

    expect(
      extractPersonnelTaskLocation({
        jabatan:
          'BA SATLANTAS DEPAN SMK KATHOLIK THOMAS AQUINO 15. GAGAS HANDRIYANA PUTRA BRIPTU BA SATLANTAS',
        ket: null
      }).value
    ).toBe('DEPAN SMK KATHOLIK THOMAS AQUINO');

    expect(
      extractPersonnelTaskLocation({
        jabatan: 'BA POLSEK BOYOLANGU PAM TITIK KUMPUL PASAR SAPI LAMA BEJI',
        ket: null
      }).value
    ).toBe('PAM TITIK KUMPUL PASAR SAPI LAMA BEJI');
  });

  it('returns no location instead of guessing when the row has none', () => {
    const result = extractPersonnelTaskLocation({
      jabatan: 'BA SATLANTAS',
      ket: null
    });
    expect(result.value).toBeNull();
    expect(result.confidence).toBe('low');
  });
});
