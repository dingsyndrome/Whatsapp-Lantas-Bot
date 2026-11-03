import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import type { CustomRecapResult } from '../server/services/custom-recap-service.js';
import {
  buildCustomRecapDocx,
  buildCustomRecapExport,
  buildCustomRecapPdf,
  buildCustomRecapXlsx
} from '../server/services/custom-recap-export-service.js';

const recap: CustomRecapResult = {
  range: {
    from: '2026-10-29',
    to: '2026-10-29',
    startTime: '08:20',
    endTime: '09:20'
  },
  category: 'PENGATURAN',
  counts: { photos: 2, links: 1, activities: 2, supervisors: 1 },
  activities: [
    {
      id: 'a1',
      at: '2026-10-29T01:25:00.000Z',
      timeText: '08:25',
      category: 'PENGATURAN',
      address: 'Kec. Kedungwaru',
      senderName: 'Andi S Charisma',
      senderLabel: 'BRIPKA ANDI SISCA',
      unitName: 'Satlantas Polres Tulungagung',
      matchStatus: 'MATCHED',
      supervisorSandi: '12.1',
      supervisorName: 'IVAN DANARA OKTAVIAN',
      supervisorRank: 'AKP'
    },
    {
      id: 'a2',
      at: '2026-10-29T01:40:00.000Z',
      timeText: '08:40',
      category: 'PENGATURAN',
      address: 'Kec. Alok',
      senderName: 'Rizki Indra',
      senderLabel: 'BRIPTU RIZKI INDRA SUSANTO',
      unitName: null,
      matchStatus: 'PARTIAL_MATCH',
      supervisorSandi: null,
      supervisorName: null,
      supervisorRank: null
    }
  ],
  supervisors: [
    {
      sandi: '12.1',
      name: 'IVAN DANARA OKTAVIAN',
      rank: 'AKP',
      count: 1,
      firstAt: '2026-10-29T01:25:00.000Z',
      lastAt: '2026-10-29T01:25:00.000Z',
      times: ['08:25'],
      locations: ['Kec. Kedungwaru']
    }
  ],
  supervisionEvents: [
    {
      id: 's1',
      at: '2026-10-29T01:25:00.000Z',
      time: '08:25',
      sandi: '12.1',
      name: 'IVAN DANARA OKTAVIAN',
      rank: 'AKP',
      location: 'Kec. Kedungwaru',
      turjawaliType: 'PENGATURAN'
    }
  ],
  personnel: {
    rosterTotal: 89,
    submitted: [
      {
        name: 'ANDI SISCA',
        displayName: 'BRIPKA ANDI SISCA',
        rank: 'BRIPKA',
        rankNrp: 'BRIPKA/86100697',
        category: 'ANGGOTA',
        photos: 1,
        links: 1,
        firstAt: '2026-10-29T01:25:00.000Z',
        lastAt: '2026-10-29T01:40:00.000Z',
        times: ['08:25', '08:40']
      }
    ],
    notSubmitted: [
      {
        name: 'IMA SAFITRI',
        displayName: 'AIPDA IMA SAFITRI',
        rank: 'AIPDA',
        rankNrp: 'AIPDA/86020531',
        category: 'ANGGOTA',
        phone: '6282232604077'
      },
      {
        name: 'IVAN DANARA OKTAVIAN',
        displayName: 'AKP IVAN DANARA OKTAVIAN',
        rank: 'AKP',
        rankNrp: 'AKP/94101244',
        category: 'PERWIRA',
        phone: '6281210655247'
      }
    ]
  },
  text: 'teks rekap'
};

describe('export rekap kustom', () => {
  it('membuat Excel dengan sheet kegiatan dan personel', async () => {
    const buffer = await buildCustomRecapXlsx(recap);
    expect(buffer.subarray(0, 2).toString()).toBe('PK');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Ringkasan',
      'Kegiatan',
      'Sudah Melapor',
      'Belum Melapor',
      'Perwira Pengawas',
      'Supervisi'
    ]);
    const activities = workbook.getWorksheet('Kegiatan');
    expect(activities?.getCell('F2').value).toBe('BRIPKA ANDI SISCA');
    const pending = workbook.getWorksheet('Belum Melapor');
    expect(pending?.getCell('B2').value).toBe('AIPDA IMA SAFITRI');
    // Perwira tidak masuk daftar personel yang belum melapor.
    expect(pending?.rowCount).toBe(2);
  });

  it('membuat Word yang bisa dibaca kembali', async () => {
    const buffer = await buildCustomRecapDocx(recap);
    expect(buffer.subarray(0, 2).toString()).toBe('PK');

    const text = (await mammoth.extractRawText({ buffer })).value;
    expect(text).toContain('REKAP PENGATURAN (GATUR)');
    expect(text).toContain('BRIPKA ANDI SISCA');
    expect(text).toContain('AIPDA IMA SAFITRI');
  });

  it('membuat PDF yang valid dan memuat nama personel', async () => {
    const buffer = await buildCustomRecapPdf(recap);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1000);

    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const text = (await parser.getText()).text;
      expect(text).toContain('BRIPKA ANDI SISCA');
      expect(text).toContain('AIPDA IMA SAFITRI');
    } finally {
      await parser.destroy();
    }
  });

  it('mengembalikan nama file dan content type sesuai format', async () => {
    const xlsx = await buildCustomRecapExport(recap, 'xlsx');
    const docx = await buildCustomRecapExport(recap, 'docx');
    const pdf = await buildCustomRecapExport(recap, 'pdf');

    expect(xlsx.filename).toBe('SIGAP-Rekap-PENGATURAN-2026-10-29.xlsx');
    expect(docx.contentType).toContain('wordprocessingml');
    expect(pdf.contentType).toBe('application/pdf');
  });
});
