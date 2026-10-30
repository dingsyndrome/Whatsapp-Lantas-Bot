import { describe, expect, it } from 'vitest';
import type {
  TurjawaliMatchInput,
  TurjawaliSprinCandidate
} from '../server/services/ocr/turjawali-matcher.js';
import {
  classifySprinTurjawali,
  classifyTurjawaliActivity,
  haversineMeters,
  isTimeInRange,
  scoreTurjawaliCandidate
} from '../server/services/ocr/turjawali-matcher.js';
import { DEFAULT_TURJAWALI_RULES } from '../shared/types.js';

function input(overrides: Partial<TurjawaliMatchInput> = {}): TurjawaliMatchInput {
  return {
    ocr: {
      timeText: '06:47',
      capturedAt: new Date(2026, 9, 27, 6, 47),
      address: 'Jl. Raya Maumere - Ende, Desa Waioti, Kec. Alok Timur, Kab. Sikka',
      village: 'Waioti',
      district: 'Alok Timur',
      regency: 'Sikka',
      province: 'Nusa Tenggara Timur',
      latitude: -8.619101,
      longitude: 122.217334,
      rawText: 'TIMEMARK 06:47 Selasa, 27/10/2026'
    },
    senderName: 'Bripka Marthen Lawe',
    senderNumber: '6281298765432',
    caption: 'Giat gatur pagi simpang TKK, situasi lancar.',
    ...overrides
  };
}

function candidate(overrides: Partial<TurjawaliSprinCandidate> = {}): TurjawaliSprinCandidate {
  return {
    id: 'sprin-1',
    number: 'Sprin/1806/X/KEP./2026',
    about: 'Pengaturan lalu lintas pagi',
    untuk: 'Melaksanakan pengaturan di simpang TKK',
    place: 'Jl. Raya Maumere - Ende, Desa Waioti, Kec. Alok Timur, Kab. Sikka',
    latitude: -8.619101,
    longitude: 122.217334,
    activityDate: new Date(2026, 9, 27),
    timeText: '07:00',
    turjawaliType: 'PENGATURAN',
    personnel: [
      {
        id: 'person-1',
        name: 'BRIPKA MARTHEN LAWE',
        rankNrp: 'BRIPKA/880415',
        jabatan: 'BRIGADIR LANTAS',
        penugasan: 'PESERTA'
      }
    ],
    ...overrides
  };
}

describe('Turjawali classification engine', () => {
  it('classifies gatur from caption, intersection and morning time', () => {
    const result = classifyTurjawaliActivity({
      caption: 'Izin komandan, giat gatur pagi simpang TKK situasi lancar',
      ocr: {
        timeText: '06:47',
        address: 'Depan TKK Bhayangkari, Jl. K.S Tubun, Simpang Empat'
      }
    });
    expect(result.type).toBe('PENGATURAN');
    expect(result.confidence).toBeGreaterThan(70);
    expect(result.keywordHits).toContain('gatur');
    expect(result.reasons.join(' ')).toMatch(/Gatur Pagi/);
  });

  it('classifies penjagaan from pos/mako keywords', () => {
    const result = classifyTurjawaliActivity({
      caption: 'Laporan penjagaan pos lantas depan Mako Polres, situasi aman',
      ocr: {
        timeText: '10:15',
        address: 'Jl. Diponegoro, depan Mako Polres Sikka'
      }
    });
    expect(result.type).toBe('PENJAGAAN');
    expect(result.confidence).toBeGreaterThan(60);
  });

  it('classifies pengawalan from VVIP/konvoi keywords', () => {
    const result = classifyTurjawaliActivity({
      caption: 'Pengawalan konvoi VVIP menuju Maumere, situasi kondusif',
      ocr: {
        timeText: '09:15',
        address: 'Jl. El Tari, Kab. Sikka'
      }
    });
    expect(result.type).toBe('PENGAWALAN');
    expect(result.score).toBeGreaterThan(5);
  });

  it('classifies patroli from blue light patrol and night window', () => {
    const result = classifyTurjawaliActivity({
      caption: 'Blue Light Patrol rawan laka Jl. Soekarno-Hatta',
      ocr: {
        timeText: '22:30',
        address: 'Jl. Soekarno-Hatta, Kab. Sikka'
      }
    });
    expect(result.type).toBe('PATROLI');
    expect(result.reasons.join(' ')).toMatch(/Patroli Malam/);
  });

  it('returns LAINNYA when there is no strong signal', () => {
    const result = classifyTurjawaliActivity({
      caption: 'Dokumentasi kegiatan hari ini',
      ocr: {
        timeText: '12:30',
        address: 'Jl. Ahmad Yani'
      }
    });
    expect(result.type).toBe('LAINNYA');
    expect(result.confidence).toBeLessThanOrEqual(42);
  });

  it('classifies a Sprin document from its Untuk text', () => {
    const result = classifySprinTurjawali({
      about: 'Melaksanakan penjagaan pos lalu lintas',
      untuk: 'Melaksanakan penjagaan pos lalu lintas di Jl. Diponegoro',
      dasar: 'Surat Perintah Kapolda'
    });
    expect(result.type).toBe('PENJAGAAN');
    expect(result.keywordHits).toContain('penjagaan');
  });

  it('uses custom keywords and supports overnight time ranges', () => {
    const result = classifyTurjawaliActivity({
      caption: 'Giat pengamanan sekolah',
      ocr: { timeText: '06:30', address: 'Jl. Pendidikan' },
      rules: {
        ...DEFAULT_TURJAWALI_RULES,
        keywords: {
          ...DEFAULT_TURJAWALI_RULES.keywords,
          PENGATURAN: ['sekolah']
        }
      }
    });
    expect(result.type).toBe('PENGATURAN');
    expect(isTimeInRange(23 * 60 + 30, '21:00', '04:00')).toBe(true);
    expect(isTimeInRange(12 * 60, '21:00', '04:00')).toBe(false);
  });
});

describe('Turjawali smart matching score', () => {
  it('scores an exact date, time, GPS, type and personnel match', () => {
    const classification = classifyTurjawaliActivity({
      caption: 'Gatur pagi simpang TKK',
      ocr: input().ocr
    });
    const scored = scoreTurjawaliCandidate(
      input(),
      classification,
      candidate(),
      DEFAULT_TURJAWALI_RULES
    );
    expect(scored.score).toBe(100);
    expect(scored.typeMismatch).toBe(false);
    expect(scored.matchedPersonnelId).toBe('person-1');
    expect(scored.breakdown.date).toBe(30);
    expect(scored.breakdown.location).toBe(25);
    expect(scored.breakdown.time).toBe(22);
  });

  it('caps score and marks type mismatch as partial-compatible', () => {
    const classification = classifyTurjawaliActivity({
      caption: 'Patroli rawan laka',
      ocr: input().ocr
    });
    const scored = scoreTurjawaliCandidate(
      input({ caption: 'Patroli rawan laka' }),
      classification,
      candidate(),
      DEFAULT_TURJAWALI_RULES
    );
    expect(classification.type).toBe('PATROLI');
    expect(scored.typeMismatch).toBe(true);
    expect(scored.score).toBeLessThanOrEqual(70);
  });

  it('uses GPS radius tolerance when coordinates are available', () => {
    const near = scoreTurjawaliCandidate(
      input(),
      classifyTurjawaliActivity({ caption: 'gatur pagi' }),
      candidate({ latitude: -8.6195, longitude: 122.2175 }),
      DEFAULT_TURJAWALI_RULES
    );
    const far = scoreTurjawaliCandidate(
      input(),
      classifyTurjawaliActivity({ caption: 'gatur pagi' }),
      candidate({ latitude: -8.65, longitude: 122.25 }),
      DEFAULT_TURJAWALI_RULES
    );
    expect(near.breakdown.location).toBe(25);
    expect(far.breakdown.location).toBe(0);
    expect(haversineMeters(-8.619101, 122.217334, -8.6195, 122.2175)).toBeLessThan(
      DEFAULT_TURJAWALI_RULES.matchLocationRadiusMeters
    );
  });

  it('keeps score lower when personnel and date do not match', () => {
    const scored = scoreTurjawaliCandidate(
      input({
        senderName: 'Orang Tidak Dikenal',
        ocr: {
          ...input().ocr,
          capturedAt: new Date(2026, 9, 20, 6, 47)
        }
      }),
      classifyTurjawaliActivity({ caption: 'gatur pagi' }),
      candidate(),
      DEFAULT_TURJAWALI_RULES
    );
    expect(scored.score).toBeLessThan(75);
    expect(scored.matchedPersonnelId).toBeNull();
    expect(scored.breakdown.date).toBe(0);
  });

  it('matches schedule times that cross midnight', () => {
    const scored = scoreTurjawaliCandidate(
      input({
        caption: 'Patroli malam rawan laka',
        ocr: {
          ...input().ocr,
          timeText: '23:50',
          capturedAt: new Date(2026, 9, 27, 23, 50)
        }
      }),
      classifyTurjawaliActivity({ caption: 'Patroli malam rawan laka' }),
      candidate({
        turjawaliType: 'PATROLI',
        timeText: '00:10'
      }),
      DEFAULT_TURJAWALI_RULES
    );
    expect(scored.breakdown.time).toBe(22);
  });

  it('mengenali kegiatan Regident (SIM/STNK) sebagai kategori tersendiri', () => {
    const result = classifyTurjawaliActivity({
      caption: 'Pelayanan perpanjangan SIM dan pengesahan STNK di Samsat Tulungagung',
      ocr: {
        address: 'Samsat Tulungagung',
        unitName: 'Satlantas Polres Tulungagung'
      }
    });
    expect(result.type).toBe('REGIDENT');
  });
});
