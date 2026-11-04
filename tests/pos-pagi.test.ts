import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { distanceMeters } from '../server/lib/geo.js';
import { parsePosPagiWorkbook } from '../server/services/pos-pagi-service.js';

async function workbookBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('POS');
  sheet.addRow(['DAFTAR POS PAGI']);
  sheet.addRow([]);
  sheet.addRow(['NO', 'NAMA', 'PANGKAT', 'JABATAN', 'POS']);
  sheet.addRow([1, 'SUWANTO', 'AIPTU', 'BA SATLANTAS', 'DEPAN SMPN 6 -8.058888, 111.907502']);
  sheet.addRow([2, 'BAMBANG RIYADI', 'AIPDA', 'BA SATLANTAS']);
  sheet.mergeCells('E4:E5');
  sheet.addRow([3, 'KIKIS AGUNG', 'IPDA', 'KANIT', 'PADAL']);
  sheet.addRow([4, 'NUR CHOLIK', 'AIPTU', 'BA SATLANTAS', 'DEPAN SMPN 3 -8.059632, 111.908836']);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

describe('POS PAGI parser', () => {
  it('maps merged post cells to every member in the merge', async () => {
    const parsed = await parsePosPagiWorkbook(await workbookBuffer());
    expect(parsed.posts).toHaveLength(2);
    expect(parsed.assignments).toHaveLength(4);
    expect(parsed.assignments[0]).toMatchObject({
      no: 1,
      name: 'SUWANTO',
      postName: 'DEPAN SMPN 6',
      latitude: -8.058888,
      longitude: 111.907502,
      role: 'ANGGOTA'
    });
    expect(parsed.assignments[1]).toMatchObject({
      no: 2,
      name: 'BAMBANG RIYADI',
      postName: 'DEPAN SMPN 6'
    });
    expect(parsed.assignments[2]).toMatchObject({
      no: 3,
      name: 'KIKIS AGUNG',
      role: 'PADAL',
      postName: null
    });
    expect(parsed.posts[0]?.assignments).toHaveLength(2);
  });

  it('rejects a file without a POS PAGI table', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Kosong').addRow(['Bukan tabel pos']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    await expect(parsePosPagiWorkbook(buffer)).rejects.toThrow(/tabel POS PAGI/i);
  });
});

describe('distanceMeters', () => {
  it('returns a realistic distance for nearby points', () => {
    const distance = distanceMeters(-8.058888, 111.907502, -8.059632, 111.908836);
    expect(distance).toBeGreaterThan(80);
    expect(distance).toBeLessThan(250);
  });
});
