import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseRosterSheet } from '../server/services/documents/roster-sheet.js';
import { normalizePhone, samePhone } from '../server/lib/phone.js';

const HEADER = ['NO', 'NAMA', '', 'PANGKAT', 'NRP', 'JABATAN', '', '', '', 'NO HP'];
const ROWS = [
  ['1', 'IVAN DANARA OKTAVIAN', '', 'AKP', '94101244', 'KASAT LANTAS', '', '', '', '6281210655247'],
  ['2', 'AHMAD ZAENUDIN', '', 'IPTU', '83010017', 'KBO SATLANTAS', '', '', '', '081335775719'],
  ['3', 'KIKIS AGUNG D.H', '', 'IPDA', '83081176', 'KANIT TURJAGWALI', '', '', '', '+62 812-1619-388'],
  ['4', 'BRIPKA MARTHEN LAWE', '', 'BRIPKA', '880415', 'BANIT TURJAGWALI SATLANTAS (R2)', '', '', '', '6281298765432']
];

async function xlsxBuffer(rows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('PERSONIL');
  rows.forEach((cells) => sheet.addRow(cells));
  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data as ArrayBuffer);
}

describe('Basis data personel (roster)', () => {
  it('membaca layout asli Satlantas (kolom penyangga C, G, H, I)', async () => {
    const result = await parseRosterSheet(
      await xlsxBuffer([HEADER, ...ROWS]),
      'DATA_PERSONIL.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    expect(result.rows).toHaveLength(4);
    expect(result.mappedColumns).toEqual(expect.arrayContaining(['NO', 'NAMA', 'PANGKAT', 'NRP', 'JABATAN', 'NO HP']));
    expect(result.rows[0]).toMatchObject({
      no: 1,
      name: 'IVAN DANARA OKTAVIAN',
      rank: 'AKP',
      nrp: '94101244',
      jabatan: 'KASAT LANTAS',
      phone: '6281210655247',
      category: 'PERWIRA'
    });
    expect(result.counts.perwira).toBe(3);
    expect(result.counts.anggota).toBe(1);
  });

  it('menormalkan nomor HP ke format 62…', async () => {
    const result = await parseRosterSheet(await xlsxBuffer([HEADER, ...ROWS]), 'personel.xlsx');
    expect(result.rows[1]?.phone).toBe('6281335775719');
    expect(result.rows[2]?.phone).toBe('628121619388');
    expect(result.rows[3]?.phone).toBe('6281298765432');
  });

  it('mendukung CSV dengan pemisah titik koma', async () => {
    const csv = [
      'NO;NAMA;PANGKAT;NRP;JABATAN;NO HP',
      '1;BRIPDA AGUSTINA LOPES;BRIPDA;960204;ANGGOTA REGIDENT;628123456789'
    ].join('\r\n');
    const result = await parseRosterSheet(Buffer.from(csv, 'utf8'), 'personel.csv', 'text/csv');
    expect(result.rows[0]).toMatchObject({ name: 'BRIPDA AGUSTINA LOPES', category: 'ANGGOTA' });
    expect(result.rows[0]?.phone).toBe('628123456789');
  });

  it('menolak berkas tanpa kolom NAMA', async () => {
    const buffer = await xlsxBuffer([['NO', 'PANGKAT'], ['1', 'AKP']]);
    await expect(parseRosterSheet(buffer, 'salah.xlsx')).rejects.toThrow(/Header kolom tidak dikenali/);
  });

  it('menormalkan berbagai format nomor telepon', () => {
    expect(normalizePhone('0812-1065-5247')).toBe('6281210655247');
    expect(normalizePhone('+62 812 1065 5247')).toBe('6281210655247');
    expect(normalizePhone('81210655247')).toBe('6281210655247');
    expect(normalizePhone('')).toBeNull();
    expect(samePhone('081210655247', '6281210655247')).toBe(true);
    expect(samePhone('6281210655247', '628999999999')).toBe(false);
  });
});
