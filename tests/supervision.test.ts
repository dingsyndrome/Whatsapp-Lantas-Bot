import { describe, expect, it } from 'vitest';
import { analyzeSupervision } from '../server/services/ocr/supervision-detector.js';
import { findSandiCodes, normalizeSandiCode } from '../server/services/sandi-config.js';

const PERSONNEL = [
  { id: 'p1', name: 'IVAN DANARA OKTAVIAN', rank: 'AKP', phone: '6281210655247', jabatan: 'KASAT LANTAS' },
  { id: 'p2', name: 'KIKIS AGUNG D.H', rank: 'IPDA', phone: '628121619388', jabatan: 'KANIT TURJAGWALI' },
  { id: 'p3', name: 'BRIPKA MARTHEN LAWE', rank: 'BRIPKA', phone: '6281298765432', jabatan: 'BANIT' }
];

const SANDI = {
  '12.1': { id: 'p1', name: 'IVAN DANARA OKTAVIAN', rank: 'AKP', sandi: '12.1' },
  '12.5': { id: 'p2', name: 'KIKIS AGUNG D.H', rank: 'IPDA', sandi: '12.5' },
  'AGUNG 6': { id: 'p1', name: 'IVAN DANARA OKTAVIAN', rank: 'AKP', sandi: 'AGUNG 6' }
};

const base = { personnel: PERSONNEL, sandi: SANDI, senderName: 'Anggota Piket', senderNumber: '628111111111' };

describe('Deteksi supervisi perwira', () => {
  it('mengenali sandi 12.1 pada caption', () => {
    const result = analyzeSupervision({ ...base, caption: 'Supervisi gatur pagi oleh 12.1, lancar.' });
    expect(result.isSupervision).toBe(true);
    expect(result.sandi).toBe('12.1');
    expect(result.personnelId).toBe('p1');
    expect(result.rank).toBe('AKP');
  });

  it('mengenali sandi Agung 6 (PJU)', () => {
    const result = analyzeSupervision({ ...base, caption: 'Pengecekan lokasi oleh Agung 6.' });
    expect(result.sandi).toBe('AGUNG 6');
    expect(result.personnelId).toBe('p1');
  });

  it('mengenali pengirim perwira lewat nomor HP', () => {
    const result = analyzeSupervision({
      ...base,
      senderName: 'Admin',
      senderNumber: '0812-1065-5247',
      caption: 'Gatur pagi simpang TKK, situasi lancar.'
    });
    expect(result.isSupervision).toBe(true);
    expect(result.personnelId).toBe('p1');
    expect(result.reasons.join(' ')).toContain('perwira');
  });

  it('mengenali pangkat + kata kunci supervisi di caption', () => {
    const result = analyzeSupervision({
      ...base,
      caption: 'Supervisi oleh AKP IVAN DANARA, kegiatan berjalan tertib.'
    });
    expect(result.isSupervision).toBe(true);
    expect(result.name).toContain('IVAN');
  });

  it('laporan anggota biasa bukan supervisi', () => {
    const result = analyzeSupervision({
      caption: 'Laporan gatur pagi simpang TKK, situasi lancar.',
      senderName: 'BRIPKA MARTHEN LAWE',
      senderNumber: '6281298765432',
      personnel: PERSONNEL,
      sandi: SANDI
    });
    expect(result.isSupervision).toBe(false);
    expect(result.sandi).toBeNull();
  });

  it('tetap mendeteksi dari teks OCR walau caption kosong', () => {
    const result = analyzeSupervision({ ...base, caption: null, ocrText: 'Supervisi 12.5 di Jl. El Tari' });
    expect(result.isSupervision).toBe(true);
    expect(result.sandi).toBe('12.5');
  });

  it('menormalkan dan menemukan kode sandi', () => {
    expect(normalizeSandiCode('12.3')).toBe('12.3');
    expect(normalizeSandiCode('12,4')).toBe('12.4');
    expect(normalizeSandiCode('agung 12')).toBe('AGUNG 12');
    expect(normalizeSandiCode('12.9')).toBeNull();
    expect(normalizeSandiCode('agung 20')).toBeNull();
    expect(findSandiCodes('sandi 12.2 dan AGUNG-3 serta 12,6')).toEqual(
      expect.arrayContaining(['12.2', 'AGUNG 3', '12.6'])
    );
  });
});
