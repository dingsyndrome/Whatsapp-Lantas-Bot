import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  isPersonnelSheet,
  parseCsv,
  parsePersonnelSheet
} from '../server/services/documents/personnel-sheet.js';

const HEADER = ['NO', 'NAMA', 'PANGKAT/NRP', 'JABATAN', 'PENUGASAN', 'KET'];

const ROWS = [
  ['1', 'IPDA ANDI SAPUTRA', 'IPDA/850101', 'KANIT TURJAG', 'KOORDINATOR', 'PDU I'],
  ['2', 'BRIPKA MARTHEN LAWE', 'BRIPKA/880415', 'BRIGADIR LANTAS', 'PESERTA', 'PDL TWO TONE'],
  ['3', 'BRIPDA AGUSTINA LOPES', 'BRIPDA/960204', 'BRIGADIR LANTAS', 'PESERTA', 'PDL TWO TONE']
];

function csvOf(rows: string[][], delimiter = ','): string {
  return rows.map((cells) => cells.map((cell) => (cell.includes(delimiter) ? `"${cell}"` : cell)).join(delimiter)).join('\r\n');
}

async function xlsxBuffer(rows: string[][], sheetName = 'Personel'): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  rows.forEach((cells) => sheet.addRow(cells));
  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data as ArrayBuffer);
}

describe('Impor personel dari spreadsheet', () => {
  it('membaca CSV dengan pemisah koma dan memetakan kolom berdasarkan header', async () => {
    const buffer = Buffer.from(csvOf([HEADER, ...ROWS]), 'utf8');
    const result = await parsePersonnelSheet(buffer, 'personel.csv', 'text/csv');

    expect(result.personnel).toHaveLength(3);
    expect(result.skipped).toBe(0);
    expect(result.mappedColumns).toEqual(
      expect.arrayContaining(['NO', 'NAMA', 'PANGKAT/NRP', 'JABATAN', 'PENUGASAN', 'KET'])
    );
    expect(result.personnel[0]).toMatchObject({
      no: 1,
      name: 'IPDA ANDI SAPUTRA',
      rankNrp: 'IPDA/850101',
      rank: 'IPDA',
      nrp: '850101',
      jabatan: 'KANIT TURJAG',
      penugasan: 'KOORDINATOR',
      ket: 'PDU I'
    });
  });

  it('membaca CSV dengan pemisah titik koma (umum di Excel Indonesia)', async () => {
    const buffer = Buffer.from(csvOf([HEADER, ...ROWS], ';'), 'utf8');
    const result = await parsePersonnelSheet(buffer, 'personel.csv');

    expect(result.personnel).toHaveLength(3);
    expect(result.personnel[1]?.name).toBe('BRIPKA MARTHEN LAWE');
  });

  it('membaca XLSX dan menggabungkan kolom PANGKAT + NRP terpisah', async () => {
    const header = ['NO', 'NAMA', 'PANGKAT', 'NRP', 'JABATAN', 'PENUGASAN', 'KET'];
    const rows = ROWS.map((row) => [row[0], row[1], row[2]!.split('/')[0]!, row[2]!.split('/')[1]!, row[3], row[4], row[5]]);
    const buffer = await xlsxBuffer([header, ...rows]);
    const result = await parsePersonnelSheet(
      buffer,
      'personel.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    expect(result.sheetName).toBe('Personel');
    expect(result.personnel).toHaveLength(3);
    expect(result.personnel[0]).toMatchObject({ rankNrp: 'IPDA/850101', rank: 'IPDA', nrp: '850101' });
    expect(result.mappedColumns).toEqual(expect.arrayContaining(['PANGKAT', 'NRP']));
  });

  it('melewati baris kosong/header berulang dan melaporkan baris yang tidak terbaca', async () => {
    const rows = [
      HEADER,
      ROWS[0]!,
      ['', '', '', '', '', ''],
      HEADER,
      ['', '   ', '', '', '', ''],
      ROWS[1]!
    ];
    const result = await parsePersonnelSheet(Buffer.from(csvOf(rows), 'utf8'), 'personel.csv');

    expect(result.personnel).toHaveLength(2);
    expect(result.personnel.map((person) => person.name)).toEqual([
      'IPDA ANDI SAPUTRA',
      'BRIPKA MARTHEN LAWE'
    ]);
  });

  it('memberi peringatan dan tetap membaca saat header tidak dikenali', async () => {
    const buffer = Buffer.from(csvOf(ROWS), 'utf8');
    const result = await parsePersonnelSheet(buffer, 'personel.csv');

    expect(result.personnel).toHaveLength(3);
    expect(result.warnings.join(' ')).toContain('header');
  });

  it('menolak berkas tanpa baris personel', async () => {
    await expect(
      parsePersonnelSheet(Buffer.from('NO,NAMA\n', 'utf8'), 'kosong.csv')
    ).rejects.toThrow(/Tidak ada baris personel/);
  });

  it('mengenali ekstensi dan MIME yang didukung', () => {
    expect(isPersonnelSheet('a.xlsx')).toBe(true);
    expect(isPersonnelSheet('a.csv', 'text/csv')).toBe(true);
    expect(isPersonnelSheet('a.pdf')).toBe(false);
  });

  it('mengurai CSV dengan tanda kutip dan baris multiline', () => {
    const rows = parseCsv('NO,NAMA\n1,"Nama, dengan koma"\n2,"Baris\nbaru"');
    expect(rows[1]?.[1]).toBe('Nama, dengan koma');
    expect(rows[2]?.[1]).toBe('Baris\nbaru');
  });
});
