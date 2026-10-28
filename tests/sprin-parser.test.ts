import fs from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { ensureFixtures, type FixtureSet } from '../scripts/fixture-generator.js';
import { parseSprinDocument } from '../server/services/documents/sprin-reader.js';
import {
  parsePersonnelLine,
  parseSprinText,
  personnelFromTextPages
} from '../server/services/documents/sprin-parser.js';

let fixtures: FixtureSet;

beforeAll(async () => {
  fixtures = await ensureFixtures();
});

describe('Surat Perintah parser', () => {
  it('parses multi-page PDF metadata and all 24 personnel rows', async () => {
    const buffer = await fs.readFile(fixtures.pdf);
    const result = await parseSprinDocument(buffer, 'sprin.pdf', 'application/pdf');

    expect(result.number).toBe('Sprin/1806/X/KEP./2026');
    expect(result.timeText).toBe('08:00');
    expect(result.place).toContain('Jl. Raya Maumere');
    expect(result.signatory).toContain('ANDI PRATAMA');
    expect(result.signatoryRank).toBe('AKBP');
    expect(result.pageCount).toBe(3);
    expect(result.personnel).toHaveLength(24);
    expect(result.personnel[0]).toMatchObject({
      no: 1,
      name: 'IPDA ANDI SAPUTRA',
      rankNrp: 'IPDA/850101',
      penugasan: 'KOORDINATOR',
      ket: 'PDU I',
      page: 2
    });
    expect(result.personnel.at(-1)).toMatchObject({
      no: 24,
      name: 'BRIPKA SIMON PETRUS',
      page: 3
    });
    expect(result.warnings).toEqual([]);
  });

  it('parses DOCX table and metadata', async () => {
    const buffer = await fs.readFile(fixtures.docx);
    const result = await parseSprinDocument(
      buffer,
      'sprin.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );

    expect(result.number).toBe('Sprin/1833/X/KEP./2026');
    expect(result.timeText).toBe('07:00');
    expect(result.personnel).toHaveLength(24);
    expect(result.personnel[23]).toMatchObject({
      no: 24,
      name: 'BRIPKA SIMON PETRUS',
      rankNrp: 'BRIPKA/920612',
      penugasan: 'PESERTA'
    });
    expect(result.signatoryRank).toBe('AKBP');
  });

  it('parses fragmented table lines across pages', () => {
    const pages = [
      `SURAT PERINTAH
Nomor: Sprin/9001/XII/KEP./2026
TANGGAL:
31 Desember 2026
UNTUK:
1. Melaksanakan pengamanan akhir tahun.
KEPADA:
Personel Satuan Lalu Lintas.
KEPALA KEPOLISIAN RESOR SIKKA
AKBP BUDI SANTOSO`,
      `LAMPIRAN SURAT PERINTAH
NO NAMA PANGKAT/NRP JABATAN PENUGASAN KET
1 BRIPKA ANDI IPDA/850101 KANIT KOORDINATOR PDU I
2 AIPTU BUDI AIPTU/870312 BRIGADIR PENDAMPING PDL TWO TONE`,
      `LAMPIRAN SURAT PERINTAH (LANJUTAN)
NO NAMA PANGKAT/NRP JABATAN PENUGASAN KET
3 BRIPDA CITRA BRIPDA/950118 BRIGADIR PESERTA PDL TWO TONE`
    ];
    const personnel = personnelFromTextPages(pages);
    const result = parseSprinText(pages.join('\n'), pages, personnel, 3);
    expect(result.number).toBe('Sprin/9001/XII/KEP./2026');
    expect(result.personnel).toHaveLength(3);
    expect(result.personnel[2]?.page).toBe(3);
    expect(result.personnel[2]?.name).toBe('BRIPDA CITRA');
  });

  it('recognizes multi-word ranks and assignments', () => {
    const row = parsePersonnelLine(
      '23 RUDOLFUS PENATA MUDA/880901 STAF ADMINISTRASI UNDANGAN PDU II',
      3
    );
    expect(row).toMatchObject({
      no: 23,
      name: 'RUDOLFUS',
      rank: 'PENATA MUDA',
      nrp: '880901',
      jabatan: 'STAF ADMINISTRASI',
      penugasan: 'UNDANGAN',
      ket: 'PDU II'
    });
  });
});
